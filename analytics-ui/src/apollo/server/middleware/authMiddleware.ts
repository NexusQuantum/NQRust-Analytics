import { NextApiRequest } from 'next';
import { UserRepository, UserWithRoles } from '../repositories/userRepository';
import { RoleRepository } from '../repositories/roleRepository';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import { AuthService } from '../services/authService';
import { Knex } from 'knex';

export interface AuthenticatedUser {
    user: UserWithRoles | null;
    ipAddress: string | undefined;
}

/**
 * Authentication middleware for GraphQL context
 * Extracts JWT from Authorization header or cookie and validates it
 */
export class AuthMiddleware {
    private authService: AuthService;

    constructor(knex: Knex) {
        const userRepository = new UserRepository(knex);
        const roleRepository = new RoleRepository(knex);
        const auditLogRepository = new AuditLogRepository(knex);
        this.authService = new AuthService(userRepository, roleRepository, auditLogRepository);
    }

    /**
     * Extract and verify authentication from request
     * Returns user if authenticated, null otherwise
     */
    async authenticate(req: NextApiRequest): Promise<AuthenticatedUser> {
        const token = this.extractToken(req);
        const ipAddress = this.extractIpAddress(req);

        if (!token) {
            return { user: null, ipAddress };
        }

        try {
            const user = await this.authService.verifyToken(token);
            return { user, ipAddress };
        } catch (error) {
            // Token verification failed - return null user
            return { user: null, ipAddress };
        }
    }

    /**
     * Extract JWT token from request
     * Tries Authorization header first, then falls back to cookie
     */
    private extractToken(req: NextApiRequest): string | null {
        // Try Authorization header (Bearer token)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.slice(7);
        }

        // Try cookie
        const cookies = req.cookies;
        if (cookies && cookies.auth_token) {
            return cookies.auth_token;
        }

        return null;
    }

    /**
     * Extract client IP address from request
     */
    private extractIpAddress(req: NextApiRequest): string | undefined {
        // Check X-Forwarded-For header (for proxied requests)
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) {
            const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
            return ips.split(',')[0].trim();
        }

        // Check X-Real-IP header
        const realIp = req.headers['x-real-ip'];
        if (realIp) {
            return typeof realIp === 'string' ? realIp : realIp[0];
        }

        // Fallback to socket remote address
        return req.socket?.remoteAddress;
    }
}

/**
 * Create authentication context for GraphQL resolver
 * This function should be called in the GraphQL server context builder
 */
export async function createAuthContext(
    req: NextApiRequest,
    knex: Knex
): Promise<AuthenticatedUser> {
    const middleware = new AuthMiddleware(knex);
    return middleware.authenticate(req);
}
