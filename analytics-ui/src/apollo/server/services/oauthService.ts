import crypto from 'crypto';
import { Knex } from 'knex';
import { UserRepository, User } from '../repositories/userRepository';
import { RoleRepository } from '../repositories/roleRepository';
import { OAuthAccountRepository, OAuthProvider, OAuthAccount } from '../repositories/oauthAccountRepository';
import { AuditLogRepository, AuditActions } from '../repositories/auditLogRepository';
import { AuthPayload } from './authService';
import { RefreshTokenRepository } from '../repositories/refreshTokenRepository';
import { getConfig } from '../config';

/**
 * OAuth Provider Configuration
 */
export interface OAuthProviderConfig {
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
    redirectUri?: string;
}

/**
 * OAuth User Info from provider
 */
export interface OAuthUserInfo {
    id: string;
    email: string;
    name?: string;
    avatarUrl?: string;
    rawData?: Record<string, any>;
}

/**
 * OAuth Tokens from provider
 */
export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
}

/**
 * OAuth Service - handles OAuth flows for multiple providers
 */
export class OAuthService {
    private providers: Map<OAuthProvider, OAuthProviderConfig> = new Map();
    private knex: Knex;

    constructor(knex: Knex) {
        this.knex = knex;
        this.initializeProviders();
    }

    /**
     * Initialize OAuth providers from environment variables
     * Providers are only initialized if both credentials exist AND the provider is enabled
     */
    private initializeProviders(): void {
        const config = getConfig();

        // Google OAuth - only if enabled via config
        if (config.googleOAuthEnabled &&
            process.env.GOOGLE_CLIENT_ID &&
            process.env.GOOGLE_CLIENT_SECRET) {
            this.providers.set('google', {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
                scopes: ['email', 'profile'],
            });
        }

        // GitHub OAuth - only if enabled via config
        if (config.githubOAuthEnabled &&
            process.env.GITHUB_CLIENT_ID &&
            process.env.GITHUB_CLIENT_SECRET) {
            this.providers.set('github', {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
                authUrl: 'https://github.com/login/oauth/authorize',
                tokenUrl: 'https://github.com/login/oauth/access_token',
                userInfoUrl: 'https://api.github.com/user',
                scopes: ['user:email'],
            });
        }
    }

    /**
     * Get list of enabled OAuth providers
     */
    public getEnabledProviders(): OAuthProvider[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if a provider is enabled
     */
    public isProviderEnabled(provider: string): boolean {
        return this.providers.has(provider as OAuthProvider);
    }

    /**
     * Generate OAuth authorization URL
     */
    public getAuthorizationUrl(
        provider: OAuthProvider,
        redirectUri: string,
        state?: string
    ): string {
        const config = this.providers.get(provider);
        if (!config) {
            throw new Error(`OAuth provider '${provider}' is not configured`);
        }

        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: config.scopes.join(' '),
            state: state || this.generateState(),
        });

        // Provider-specific params
        if (provider === 'google') {
            params.set('access_type', 'offline');
            params.set('prompt', 'consent');
        }

        return `${config.authUrl}?${params.toString()}`;
    }

    /**
     * Exchange authorization code for tokens
     */
    public async exchangeCodeForTokens(
        provider: OAuthProvider,
        code: string,
        redirectUri: string
    ): Promise<OAuthTokens> {
        const config = this.providers.get(provider);
        if (!config) {
            throw new Error(`OAuth provider '${provider}' is not configured`);
        }

        const params = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        });

        const response = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: params.toString(),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to exchange code: ${error}`);
        }

        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            tokenType: data.token_type,
        };
    }

    /**
     * Get user info from provider
     */
    public async getUserInfo(
        provider: OAuthProvider,
        accessToken: string
    ): Promise<OAuthUserInfo> {
        const config = this.providers.get(provider);
        if (!config) {
            throw new Error(`OAuth provider '${provider}' is not configured`);
        }

        const response = await fetch(config.userInfoUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error('Failed to get user info from provider');
        }

        const data = await response.json();

        // Normalize user info based on provider
        return this.normalizeUserInfo(provider, data);
    }

    /**
     * Complete OAuth login/registration flow
     */
    public async handleOAuthCallback(
        provider: OAuthProvider,
        code: string,
        redirectUri: string,
        ipAddress?: string
    ): Promise<AuthPayload> {
        // Exchange code for tokens
        const tokens = await this.exchangeCodeForTokens(provider, code, redirectUri);

        // Get user info from provider
        const userInfo = await this.getUserInfo(provider, tokens.accessToken);

        // Create repositories
        const userRepository = new UserRepository(this.knex);
        const roleRepository = new RoleRepository(this.knex);
        const oauthAccountRepository = new OAuthAccountRepository(this.knex);
        const auditLogRepository = new AuditLogRepository(this.knex);
        const refreshTokenRepository = new RefreshTokenRepository(this.knex);

        // Check if OAuth account already exists
        const existingOAuth = await oauthAccountRepository.findByProviderAndUserId(
            provider,
            userInfo.id
        );

        let user: User;
        let isNewUser = false;

        if (existingOAuth) {
            // Existing OAuth account - get user and update tokens
            const foundUser = await userRepository.findOneBy({ id: existingOAuth.userId } as Partial<User>);
            if (!foundUser) {
                throw new Error('User account not found');
            }
            if (!foundUser.isActive) {
                throw new Error('Your account has been deactivated');
            }
            user = foundUser;

            // Update OAuth tokens
            await oauthAccountRepository.updateTokens(
                existingOAuth.id,
                tokens.accessToken,
                tokens.refreshToken,
                tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined
            );
        } else {
            // Check if user exists with this email
            const existingUserByEmail = await userRepository.findByEmail(userInfo.email);

            if (existingUserByEmail) {
                // Link OAuth to existing user
                user = existingUserByEmail;

                await oauthAccountRepository.linkAccount({
                    userId: user.id,
                    provider,
                    providerUserId: userInfo.id,
                    providerEmail: userInfo.email,
                    displayName: userInfo.name,
                    avatarUrl: userInfo.avatarUrl,
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    tokenExpiresAt: tokens.expiresIn
                        ? new Date(Date.now() + tokens.expiresIn * 1000)
                        : undefined,
                });
            } else {
                // Create new user from OAuth
                isNewUser = true;
                user = await userRepository.createOne({
                    email: userInfo.email,
                    passwordHash: '', // No password for OAuth-only users
                    displayName: userInfo.name || userInfo.email.split('@')[0],
                    avatarUrl: userInfo.avatarUrl,
                    isActive: true,
                    isVerified: true, // OAuth email is verified
                });

                // Assign default viewer role
                const viewerRole = await roleRepository.findByName('viewer');
                if (viewerRole) {
                    await userRepository.assignRole(user.id, viewerRole.id);
                }

                // Link OAuth account
                await oauthAccountRepository.linkAccount({
                    userId: user.id,
                    provider,
                    providerUserId: userInfo.id,
                    providerEmail: userInfo.email,
                    displayName: userInfo.name,
                    avatarUrl: userInfo.avatarUrl,
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    tokenExpiresAt: tokens.expiresIn
                        ? new Date(Date.now() + tokens.expiresIn * 1000)
                        : undefined,
                });
            }
        }

        // Update last login
        await userRepository.updateLastLogin(user.id);

        // Get user with roles
        const userWithRoles = await userRepository.findByIdWithRoles(user.id);

        // Log the OAuth login
        await auditLogRepository.log({
            userId: user.id,
            action: isNewUser ? AuditActions.REGISTER : AuditActions.LOGIN,
            resourceType: 'user',
            resourceId: user.id.toString(),
            details: { provider, method: 'oauth' },
            ipAddress,
        });

        // Generate tokens using a simplified flow
        const familyId = RefreshTokenRepository.generateFamilyId();
        const { token: refreshToken } = await refreshTokenRepository.createRefreshToken(
            user.id,
            familyId,
            30,
            ipAddress
        );

        const accessToken = this.generateAccessToken(user);

        return {
            user: userWithRoles!,
            accessToken,
            refreshToken,
        };
    }

    /**
     * Link OAuth account to existing user
     */
    public async linkOAuthAccount(
        userId: number,
        provider: OAuthProvider,
        code: string,
        redirectUri: string
    ): Promise<OAuthAccount> {
        const oauthAccountRepository = new OAuthAccountRepository(this.knex);

        // Check if already linked
        const existing = await oauthAccountRepository.findByUserAndProvider(userId, provider);
        if (existing) {
            throw new Error(`${provider} account is already linked`);
        }

        // Exchange code for tokens
        const tokens = await this.exchangeCodeForTokens(provider, code, redirectUri);

        // Get user info
        const userInfo = await this.getUserInfo(provider, tokens.accessToken);

        // Check if this OAuth account is linked to another user
        const existingOAuth = await oauthAccountRepository.findByProviderAndUserId(
            provider,
            userInfo.id
        );
        if (existingOAuth) {
            throw new Error(`This ${provider} account is already linked to another user`);
        }

        // Link account
        return oauthAccountRepository.linkAccount({
            userId,
            provider,
            providerUserId: userInfo.id,
            providerEmail: userInfo.email,
            displayName: userInfo.name,
            avatarUrl: userInfo.avatarUrl,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: tokens.expiresIn
                ? new Date(Date.now() + tokens.expiresIn * 1000)
                : undefined,
        });
    }

    /**
     * Unlink OAuth account from user
     */
    public async unlinkOAuthAccount(userId: number, provider: OAuthProvider): Promise<void> {
        const userRepository = new UserRepository(this.knex);
        const oauthAccountRepository = new OAuthAccountRepository(this.knex);

        // Get user
        const user = await userRepository.findOneBy({ id: userId } as Partial<User>);
        if (!user) {
            throw new Error('User not found');
        }

        // Check if user has a password (can still log in)
        const linkedAccounts = await oauthAccountRepository.findAllByUser(userId);
        if (!user.passwordHash && linkedAccounts.length <= 1) {
            throw new Error('Cannot unlink the only login method. Please set a password first.');
        }

        await oauthAccountRepository.unlinkAccount(userId, provider);
    }

    /**
     * Get linked OAuth accounts for a user
     */
    public async getLinkedAccounts(userId: number): Promise<OAuthAccount[]> {
        const oauthAccountRepository = new OAuthAccountRepository(this.knex);
        return oauthAccountRepository.findAllByUser(userId);
    }

    // Private helper methods

    private normalizeUserInfo(provider: OAuthProvider, data: any): OAuthUserInfo {
        switch (provider) {
            case 'google':
                return {
                    id: data.sub,
                    email: data.email,
                    name: data.name,
                    avatarUrl: data.picture,
                    rawData: data,
                };
            case 'github':
                return {
                    id: String(data.id),
                    email: data.email,
                    name: data.name || data.login,
                    avatarUrl: data.avatar_url,
                    rawData: data,
                };
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    private generateState(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    private generateAccessToken(user: User): string {
        const JWT_SECRET = process.env.JWT_SECRET || 'development-secret';
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const now = Math.floor(Date.now() / 1000);

        const payload = {
            userId: user.id,
            email: user.email,
            type: 'access',
            iat: now,
            exp: now + 15 * 60, // 15 minutes
        };

        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signature = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${header}.${payloadB64}`)
            .digest('base64url');

        return `${header}.${payloadB64}.${signature}`;
    }
}
