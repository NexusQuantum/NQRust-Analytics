import { Knex } from 'knex';

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    // IP-level rate limiting
    ipMaxAttempts: number;
    ipWindowMs: number;

    // User-level lockout
    userMaxFailedAttempts: number;
    userLockoutWindowMs: number;
    userLockoutDurationMs: number;

    // Global rate limiting (optional)
    globalMaxRequestsPerSecond?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
    ipMaxAttempts: 10,
    ipWindowMs: 60 * 1000, // 1 minute

    userMaxFailedAttempts: 5,
    userLockoutWindowMs: 15 * 60 * 1000, // 15 minutes
    userLockoutDurationMs: 15 * 60 * 1000, // 15 minutes lockout

    globalMaxRequestsPerSecond: 100,
};

export interface RateLimitResult {
    allowed: boolean;
    reason?: 'IP_RATE_LIMITED' | 'ACCOUNT_LOCKED' | 'GLOBAL_RATE_LIMITED';
    retryAfterMs?: number;
    remainingAttempts?: number;
}

export interface LoginAttempt {
    id: number;
    userId?: number;
    email: string;
    ipAddress: string;
    success: boolean;
    attemptedAt: Date;
    userAgent?: string;
    failureReason?: string;
}

/**
 * In-memory rate limit tracking
 * For production with multiple instances, use Redis instead
 */
interface AttemptRecord {
    attempts: number;
    firstAttemptAt: number;
    lockedUntil?: number;
}

export class RateLimitService {
    private config: RateLimitConfig;
    private knex: Knex;

    // In-memory stores for fast lookups
    private ipAttempts: Map<string, AttemptRecord> = new Map();
    private userAttempts: Map<string, AttemptRecord> = new Map();

    constructor(knex: Knex, config: Partial<RateLimitConfig> = {}) {
        this.knex = knex;
        this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };

        // Cleanup old entries periodically (every 5 minutes)
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if a login attempt is allowed
     */
    public async checkLoginLimit(
        ipAddress: string,
        email?: string
    ): Promise<RateLimitResult> {
        // Check IP-level rate limit first
        const ipResult = this.checkIpLimit(ipAddress);
        if (!ipResult.allowed) {
            return ipResult;
        }

        // Check user-level lockout if email provided
        if (email) {
            const userResult = await this.checkUserLockout(email);
            if (!userResult.allowed) {
                return userResult;
            }
        }

        return {
            allowed: true,
            remainingAttempts: this.config.ipMaxAttempts - (this.ipAttempts.get(ipAddress)?.attempts || 0),
        };
    }

    /**
     * Record a login attempt (success or failure)
     */
    public async recordLoginAttempt(
        email: string,
        ipAddress: string,
        success: boolean,
        userId?: number,
        userAgent?: string,
        failureReason?: string
    ): Promise<void> {
        // Record in database for audit trail
        await this.knex('login_attempt').insert({
            user_id: userId,
            email: email.toLowerCase(),
            ip_address: ipAddress,
            success,
            user_agent: userAgent,
            failure_reason: failureReason,
            attempted_at: this.knex.fn.now(),
        });

        if (!success) {
            // Update in-memory IP counter
            this.recordIpAttempt(ipAddress);

            // Update in-memory user counter
            this.recordUserAttempt(email.toLowerCase());
        } else {
            // On successful login, reset the user's failed attempt counter
            this.userAttempts.delete(email.toLowerCase());
        }
    }

    /**
     * Reset attempts for a user (e.g., after password reset)
     */
    public async resetUserAttempts(email: string): Promise<void> {
        this.userAttempts.delete(email.toLowerCase());
    }

    /**
     * Get recent login attempts for an email
     */
    public async getRecentAttempts(
        email: string,
        limit: number = 10
    ): Promise<LoginAttempt[]> {
        const attempts = await this.knex('login_attempt')
            .where('email', email.toLowerCase())
            .orderBy('attempted_at', 'desc')
            .limit(limit);

        return attempts.map(this.transformFromDB);
    }

    /**
     * Check if user account is currently locked
     */
    public async isAccountLocked(email: string): Promise<boolean> {
        const record = this.userAttempts.get(email.toLowerCase());
        if (!record) return false;

        if (record.lockedUntil && record.lockedUntil > Date.now()) {
            return true;
        }

        return false;
    }

    // Private methods

    private checkIpLimit(ipAddress: string): RateLimitResult {
        const now = Date.now();
        const record = this.ipAttempts.get(ipAddress);

        if (!record) {
            return { allowed: true, remainingAttempts: this.config.ipMaxAttempts };
        }

        // Check if window has expired
        if (now - record.firstAttemptAt > this.config.ipWindowMs) {
            this.ipAttempts.delete(ipAddress);
            return { allowed: true, remainingAttempts: this.config.ipMaxAttempts };
        }

        // Check if limit exceeded
        if (record.attempts >= this.config.ipMaxAttempts) {
            const retryAfterMs = this.config.ipWindowMs - (now - record.firstAttemptAt);
            return {
                allowed: false,
                reason: 'IP_RATE_LIMITED',
                retryAfterMs,
                remainingAttempts: 0,
            };
        }

        return {
            allowed: true,
            remainingAttempts: this.config.ipMaxAttempts - record.attempts,
        };
    }

    private async checkUserLockout(email: string): Promise<RateLimitResult> {
        const now = Date.now();
        const normalizedEmail = email.toLowerCase();
        const record = this.userAttempts.get(normalizedEmail);

        if (!record) {
            return { allowed: true };
        }

        // Check if account is locked
        if (record.lockedUntil && record.lockedUntil > now) {
            return {
                allowed: false,
                reason: 'ACCOUNT_LOCKED',
                retryAfterMs: record.lockedUntil - now,
                remainingAttempts: 0,
            };
        }

        // Check if lockout window has expired
        if (now - record.firstAttemptAt > this.config.userLockoutWindowMs) {
            this.userAttempts.delete(normalizedEmail);
            return { allowed: true };
        }

        return {
            allowed: true,
            remainingAttempts: this.config.userMaxFailedAttempts - record.attempts,
        };
    }

    private recordIpAttempt(ipAddress: string): void {
        const now = Date.now();
        const record = this.ipAttempts.get(ipAddress);

        if (!record || now - record.firstAttemptAt > this.config.ipWindowMs) {
            this.ipAttempts.set(ipAddress, { attempts: 1, firstAttemptAt: now });
        } else {
            record.attempts++;
        }
    }

    private recordUserAttempt(email: string): void {
        const now = Date.now();
        const normalizedEmail = email.toLowerCase();
        const record = this.userAttempts.get(normalizedEmail);

        if (!record || now - record.firstAttemptAt > this.config.userLockoutWindowMs) {
            this.userAttempts.set(normalizedEmail, { attempts: 1, firstAttemptAt: now });
        } else {
            record.attempts++;

            // Lock account if max attempts exceeded
            if (record.attempts >= this.config.userMaxFailedAttempts) {
                record.lockedUntil = now + this.config.userLockoutDurationMs;
            }
        }
    }

    private cleanup(): void {
        const now = Date.now();

        // Clean up IP attempts
        for (const [ip, record] of this.ipAttempts.entries()) {
            if (now - record.firstAttemptAt > this.config.ipWindowMs) {
                this.ipAttempts.delete(ip);
            }
        }

        // Clean up user attempts
        for (const [email, record] of this.userAttempts.entries()) {
            const windowExpired = now - record.firstAttemptAt > this.config.userLockoutWindowMs;
            const lockoutExpired = !record.lockedUntil || record.lockedUntil < now;

            if (windowExpired && lockoutExpired) {
                this.userAttempts.delete(email);
            }
        }
    }

    private transformFromDB(data: any): LoginAttempt {
        return {
            id: data.id,
            userId: data.user_id,
            email: data.email,
            ipAddress: data.ip_address,
            success: data.success,
            attemptedAt: new Date(data.attempted_at),
            userAgent: data.user_agent,
            failureReason: data.failure_reason,
        };
    }
}
