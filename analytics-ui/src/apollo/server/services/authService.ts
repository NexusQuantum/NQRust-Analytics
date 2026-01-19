import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserRepository, User, UserWithRoles } from '../repositories/userRepository';
import { RoleRepository } from '../repositories/roleRepository';
import { AuditLogRepository, AuditActions } from '../repositories/auditLogRepository';
import { RefreshTokenRepository } from '../repositories/refreshTokenRepository';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || '30', 10);
const SALT_ROUNDS = 12;

export interface AuthPayload {
    user: UserWithRoles;
    accessToken: string;
    refreshToken: string;
}

export interface TokenPayload {
    userId: number;
    email: string;
    type: 'access' | 'refresh';
    iat: number;
    exp: number;
}

export interface RegisterInput {
    email: string;
    password: string;
    displayName: string;
}

export interface LoginInput {
    email: string;
    password: string;
}

export class AuthServiceError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'AuthServiceError';
    }
}

export class AuthService {
    constructor(
        private userRepository: UserRepository,
        private roleRepository: RoleRepository,
        private auditLogRepository: AuditLogRepository,
        private refreshTokenRepository?: RefreshTokenRepository
    ) { }

    /**
     * Register a new user
     */
    public async register(
        input: RegisterInput,
        ipAddress?: string,
        userAgent?: string
    ): Promise<AuthPayload> {
        const { email, password, displayName } = input;

        // Validate email format
        if (!this.isValidEmail(email)) {
            throw new AuthServiceError('Invalid email format', 'INVALID_EMAIL');
        }

        // Validate password strength
        const passwordValidation = this.validatePassword(password);
        if (!passwordValidation.valid) {
            throw new AuthServiceError(
                passwordValidation.message!,
                'WEAK_PASSWORD'
            );
        }

        // Check if user already exists
        const existingUser = await this.userRepository.findByEmail(email);
        if (existingUser) {
            throw new AuthServiceError(
                'A user with this email already exists',
                'EMAIL_EXISTS',
                409
            );
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const user = await this.userRepository.createOne({
            email: email.toLowerCase(),
            passwordHash,
            displayName,
            isActive: true,
            isVerified: false,
        });

        // Assign default viewer role
        const viewerRole = await this.roleRepository.findByName('viewer');
        if (viewerRole) {
            await this.userRepository.assignRole(user.id, viewerRole.id);
        }

        // Get user with roles
        const userWithRoles = await this.userRepository.findByIdWithRoles(user.id);

        // Generate tokens
        const accessToken = this.generateAccessToken(user);
        const refreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);

        // Log the registration
        await this.auditLogRepository.log({
            userId: user.id,
            action: AuditActions.REGISTER,
            resourceType: 'user',
            resourceId: user.id.toString(),
            ipAddress,
        });

        return { user: userWithRoles!, accessToken, refreshToken };
    }

    /**
     * Login with email and password
     */
    public async login(
        input: LoginInput,
        ipAddress?: string,
        userAgent?: string
    ): Promise<AuthPayload> {
        const { email, password } = input;

        // Find user by email
        const user = await this.userRepository.findByEmail(email.toLowerCase());
        if (!user) {
            throw new AuthServiceError(
                'Invalid email or password',
                'INVALID_CREDENTIALS',
                401
            );
        }

        // Check if user is active
        if (!user.isActive) {
            throw new AuthServiceError(
                'Your account has been deactivated',
                'ACCOUNT_DEACTIVATED',
                403
            );
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            throw new AuthServiceError(
                'Invalid email or password',
                'INVALID_CREDENTIALS',
                401
            );
        }

        // Update last login
        await this.userRepository.updateLastLogin(user.id);

        // Get user with roles
        const userWithRoles = await this.userRepository.findByIdWithRoles(user.id);

        // Generate tokens
        const accessToken = this.generateAccessToken(user);
        const refreshToken = await this.createRefreshToken(user.id, ipAddress, userAgent);

        // Log the login
        await this.auditLogRepository.log({
            userId: user.id,
            action: AuditActions.LOGIN,
            resourceType: 'user',
            resourceId: user.id.toString(),
            ipAddress,
        });

        return { user: userWithRoles!, accessToken, refreshToken };
    }

    /**
     * Refresh access token using a valid refresh token
     * Implements token rotation for security
     */
    public async refreshAccessToken(
        refreshToken: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<AuthPayload> {
        if (!this.refreshTokenRepository) {
            throw new AuthServiceError(
                'Refresh token functionality not available',
                'REFRESH_NOT_AVAILABLE',
                501
            );
        }

        // Hash the incoming token to look it up
        const tokenHash = RefreshTokenRepository.hashToken(refreshToken);

        // Find the token
        const storedToken = await this.refreshTokenRepository.findValidByTokenHash(tokenHash);

        if (!storedToken) {
            // Token not found or expired/revoked
            throw new AuthServiceError(
                'Invalid or expired refresh token',
                'INVALID_REFRESH_TOKEN',
                401
            );
        }

        // Get user
        const user = await this.userRepository.findByIdWithRoles(storedToken.userId);
        if (!user || !user.isActive) {
            // Revoke the token family if user is inactive
            await this.refreshTokenRepository.revokeTokenFamily(storedToken.familyId);
            throw new AuthServiceError(
                'User account is not active',
                'ACCOUNT_DEACTIVATED',
                403
            );
        }

        // Token rotation: revoke old token and issue new one
        await this.refreshTokenRepository.revokeToken(storedToken.id);

        // Create new refresh token in the same family
        const { token: newRefreshToken } = await this.refreshTokenRepository.createRefreshToken(
            user.id,
            storedToken.familyId, // Same family for rotation detection
            JWT_REFRESH_EXPIRES_IN_DAYS,
            ipAddress,
            userAgent
        );

        // Generate new access token
        const accessToken = this.generateAccessToken(user);

        return { user, accessToken, refreshToken: newRefreshToken };
    }

    /**
     * Revoke a specific refresh token
     */
    public async revokeRefreshToken(refreshToken: string): Promise<void> {
        if (!this.refreshTokenRepository) return;

        const tokenHash = RefreshTokenRepository.hashToken(refreshToken);
        const storedToken = await this.refreshTokenRepository.findByTokenHash(tokenHash);

        if (storedToken) {
            await this.refreshTokenRepository.revokeToken(storedToken.id);
        }
    }

    /**
     * Revoke all refresh tokens for a user (force logout everywhere)
     */
    public async revokeAllUserTokens(userId: number): Promise<void> {
        if (!this.refreshTokenRepository) return;
        await this.refreshTokenRepository.revokeAllUserTokens(userId);
    }

    /**
     * Verify a JWT access token and return the user
     */
    public async verifyToken(token: string): Promise<UserWithRoles | null> {
        try {
            const payload = this.decodeToken(token);
            if (!payload) return null;

            // Check if token is expired
            if (payload.exp * 1000 < Date.now()) {
                return null;
            }

            const user = await this.userRepository.findByIdWithRoles(payload.userId);
            if (!user || !user.isActive) {
                return null;
            }

            return user;
        } catch {
            return null;
        }
    }

    /**
     * Change password for authenticated user
     */
    public async changePassword(
        userId: number,
        oldPassword: string,
        newPassword: string,
        ipAddress?: string
    ): Promise<void> {
        const user = await this.userRepository.findOneBy({ id: userId } as Partial<User>);
        if (!user) {
            throw new AuthServiceError('User not found', 'USER_NOT_FOUND', 404);
        }

        // Verify old password
        const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isValid) {
            throw new AuthServiceError(
                'Current password is incorrect',
                'INVALID_PASSWORD',
                401
            );
        }

        // Validate new password
        const passwordValidation = this.validatePassword(newPassword);
        if (!passwordValidation.valid) {
            throw new AuthServiceError(
                passwordValidation.message!,
                'WEAK_PASSWORD'
            );
        }

        // Hash and update password
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await this.userRepository.updateOne(userId, { passwordHash } as Partial<User>);

        // Revoke all refresh tokens (force re-login)
        await this.revokeAllUserTokens(userId);

        // Log the password change
        await this.auditLogRepository.log({
            userId,
            action: AuditActions.PASSWORD_CHANGE,
            resourceType: 'user',
            resourceId: userId.toString(),
            ipAddress,
        });
    }

    /**
     * Generate a password reset token
     */
    public async requestPasswordReset(
        email: string,
        ipAddress?: string
    ): Promise<string | null> {
        const user = await this.userRepository.findByEmail(email.toLowerCase());
        if (!user) {
            // Don't reveal if email exists
            return null;
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Log the request
        await this.auditLogRepository.log({
            userId: user.id,
            action: AuditActions.PASSWORD_RESET_REQUEST,
            resourceType: 'user',
            resourceId: user.id.toString(),
            ipAddress,
        });

        return resetToken;
    }

    /**
     * Logout - revoke refresh token and log
     */
    public async logout(
        userId: number,
        refreshToken?: string,
        ipAddress?: string
    ): Promise<void> {
        // Revoke the specific refresh token if provided
        if (refreshToken) {
            await this.revokeRefreshToken(refreshToken);
        }

        await this.auditLogRepository.log({
            userId,
            action: AuditActions.LOGOUT,
            resourceType: 'user',
            resourceId: userId.toString(),
            ipAddress,
        });
    }

    /**
     * Check if user has a specific permission
     */
    public async hasPermission(
        userId: number,
        resource: string,
        action: string
    ): Promise<boolean> {
        return this.userRepository.hasPermission(userId, resource, action);
    }

    /**
     * Check if user has admin role
     */
    public async isAdmin(userId: number): Promise<boolean> {
        const roles = await this.userRepository.getUserRoles(userId);
        return roles.some(role => role.name === 'admin');
    }

    // Private helper methods

    private async createRefreshToken(
        userId: number,
        ipAddress?: string,
        userAgent?: string
    ): Promise<string> {
        if (!this.refreshTokenRepository) {
            // Fallback: return a simple token if repository not available
            return crypto.randomBytes(32).toString('hex');
        }

        const familyId = RefreshTokenRepository.generateFamilyId();
        const { token } = await this.refreshTokenRepository.createRefreshToken(
            userId,
            familyId,
            JWT_REFRESH_EXPIRES_IN_DAYS,
            ipAddress,
            userAgent
        );
        return token;
    }

    private generateAccessToken(user: User | UserWithRoles): string {
        const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
            userId: user.id,
            email: user.email,
            type: 'access',
        };

        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = this.parseExpiration(JWT_ACCESS_EXPIRES_IN);

        const payloadWithTime = {
            ...payload,
            iat: now,
            exp: now + expiresIn,
        };

        const payloadB64 = Buffer.from(JSON.stringify(payloadWithTime)).toString('base64url');
        const signature = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${header}.${payloadB64}`)
            .digest('base64url');

        return `${header}.${payloadB64}.${signature}`;
    }

    private decodeToken(token: string): TokenPayload | null {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const [header, payload, signature] = parts;

            // Verify signature
            const expectedSignature = crypto
                .createHmac('sha256', JWT_SECRET)
                .update(`${header}.${payload}`)
                .digest('base64url');

            if (signature !== expectedSignature) return null;

            return JSON.parse(Buffer.from(payload, 'base64url').toString());
        } catch {
            return null;
        }
    }

    private parseExpiration(expiration: string): number {
        const match = expiration.match(/^(\d+)([smhd])$/);
        if (!match) return 15 * 60; // Default 15 minutes

        const value = parseInt(match[1], 10);
        const unit = match[2];

        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 60 * 60;
            case 'd': return value * 24 * 60 * 60;
            default: return 15 * 60;
        }
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private validatePassword(password: string): { valid: boolean; message?: string } {
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters long' };
        }
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }
        if (!/[0-9]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }
        return { valid: true };
    }
}
