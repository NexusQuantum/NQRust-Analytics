import NextAuth, { NextAuthOptions, Session } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { components } from '@/common';
import { UserRepository } from '@/apollo/server/repositories/userRepository';
import { RoleRepository } from '@/apollo/server/repositories/roleRepository';
import { AuditLogRepository, AuditActions } from '@/apollo/server/repositories/auditLogRepository';
import { RateLimitService } from '@/apollo/server/services/rateLimitService';
import bcrypt from 'bcryptjs';

const { knex } = components;

export const authOptions: NextAuthOptions = {
    secret: process.env.NEXTAUTH_SECRET,
    session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 }, // 7 days
    pages: { signIn: '/login', error: '/login' },

    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials, req) {
                const { email, password } = credentials ?? {};
                if (!email || !password) return null;

                const ipAddress = (req?.headers?.['x-forwarded-for'] as string)
                    ?.split(',')[0].trim() || 'unknown';

                // Rate limiting
                const rateLimitService = new RateLimitService(knex);
                const rateLimit = await rateLimitService.checkLoginLimit(ipAddress, email);
                if (!rateLimit.allowed) {
                    throw new Error(rateLimit.reason === 'ACCOUNT_LOCKED'
                        ? 'Account temporarily locked. Try again later.'
                        : 'Too many login attempts. Try again later.');
                }

                const userRepository = new UserRepository(knex);
                const user = await userRepository.findByEmail(email);

                if (!user || !user.isActive) {
                    await rateLimitService.recordLoginAttempt(email, ipAddress, false, undefined, undefined, 'INVALID_PASSWORD');
                    return null;
                }

                const valid = await bcrypt.compare(password, user.passwordHash);
                if (!valid) {
                    await rateLimitService.recordLoginAttempt(email, ipAddress, false, user.id, undefined, 'INVALID_PASSWORD');
                    return null;
                }

                await rateLimitService.recordLoginAttempt(email, ipAddress, true, user.id);
                await userRepository.updateLastLogin(user.id);

                // Audit log
                const auditLogRepository = new AuditLogRepository(knex);
                await auditLogRepository.log({
                    userId: user.id,
                    action: AuditActions.LOGIN,
                    resourceType: 'auth',
                    ipAddress,
                });

                return { id: String(user.id), email: user.email };
            },
        }),

        // Keycloak / NQRust Identity — only active when env vars are set
        // wellKnown is intentionally NOT used: it would fetch the discovery document
        // from KEYCLOAK_URL (host.docker.internal) and override our explicit authorization.url
        // with a host.docker.internal URL that the browser cannot reach.
        // Instead we set each endpoint explicitly:
        //   authorization → KEYCLOAK_PUBLIC_URL (browser-facing, e.g. localhost)
        //   token/userinfo/jwks → KEYCLOAK_URL (server-to-server, e.g. host.docker.internal)
        ...(process.env.KEYCLOAK_OAUTH_ENABLED === 'true' &&
            process.env.KEYCLOAK_CLIENT_ID &&
            process.env.KEYCLOAK_CLIENT_SECRET
            ? [{
                id: 'keycloak',
                name: 'NQRust Identity',
                type: 'oauth' as const,
                authorization: {
                    url: `${process.env.KEYCLOAK_PUBLIC_URL}/realms/${process.env.KEYCLOAK_REALM || 'master'}/protocol/openid-connect/auth`,
                    params: { scope: 'openid email profile' },
                },
                token: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM || 'master'}/protocol/openid-connect/token`,
                userinfo: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM || 'master'}/protocol/openid-connect/userinfo`,
                jwks_endpoint: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM || 'master'}/protocol/openid-connect/certs`,
                // issuer must match the `iss` claim Keycloak puts in the ID token.
                // Keycloak uses its own public URL for `iss`, so we use KEYCLOAK_PUBLIC_URL here.
                issuer: `${process.env.KEYCLOAK_PUBLIC_URL}/realms/${process.env.KEYCLOAK_REALM || 'master'}`,
                clientId: process.env.KEYCLOAK_CLIENT_ID,
                clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
                idToken: true,
                checks: ['pkce', 'state'] as ['pkce', 'state'],
                profile(profile: any) {
                    return {
                        id: profile.sub,
                        email: profile.email,
                        name: profile.name || profile.preferred_username,
                        image: profile.picture,
                    };
                },
            }]
            : []),
    ],

    callbacks: {
        // signIn: auto-register Keycloak users into our DB
        async signIn({ user, account }) {
            if (account?.provider === 'keycloak') {
                const userRepository = new UserRepository(knex);
                const roleRepository = new RoleRepository(knex);
                const autoRegister = process.env.KEYCLOAK_AUTO_REGISTER !== 'false';

                let dbUser = await userRepository.findByEmail(user.email!);
                if (!dbUser) {
                    if (!autoRegister) return false;
                    const newUser = await userRepository.createOne({
                        email: user.email!,
                        passwordHash: '',
                        displayName: user.name || user.email!,
                        avatarUrl: (user as any).image || null,
                        isActive: true,
                        isVerified: true,
                    });
                    const defaultRole = process.env.KEYCLOAK_DEFAULT_ROLE || 'viewer';
                    const role = await roleRepository.findByName(defaultRole);
                    if (role) await userRepository.assignRole(newUser.id, role.id);
                    dbUser = await userRepository.findByIdWithRoles(newUser.id);
                }

                if (!dbUser?.isActive) return false;

                // Inject our DB userId so the jwt callback can pick it up
                user.id = String(dbUser.id);
            }
            return true;
        },

        // jwt: on first sign-in load full user data from DB into the token
        async jwt({ token, user }) {
            if (user?.id) {
                const userRepository = new UserRepository(knex);
                const dbUser = await userRepository.findByIdWithRoles(Number(user.id));
                if (dbUser) {
                    token.userId = dbUser.id;
                    token.email = dbUser.email;
                    token.displayName = dbUser.displayName;
                    token.avatarUrl = dbUser.avatarUrl ?? undefined;
                    token.roles = dbUser.roles as any;
                }
            }
            return token;
        },

        // session: expose enriched user data to the client
        async session({ session, token }) {
            session.user = {
                id: token.userId,
                email: token.email,
                displayName: token.displayName,
                avatarUrl: token.avatarUrl,
                isActive: true,
                isVerified: true,
                roles: (token.roles || []) as Session['user']['roles'],
            };
            return session;
        },
    },
};

export default NextAuth(authOptions);
