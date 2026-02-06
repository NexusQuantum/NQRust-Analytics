import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';
import crypto from 'crypto';

export interface RefreshToken {
    id: number;
    userId: number;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    revokedAt?: Date;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IRefreshTokenRepository extends IBasicRepository<RefreshToken> {
    findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
    findValidByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
    revokeToken(id: number): Promise<void>;
    revokeAllUserTokens(userId: number): Promise<void>;
    revokeTokenFamily(familyId: string): Promise<void>;
    cleanupExpiredTokens(): Promise<number>;
}

export class RefreshTokenRepository
    extends BaseRepository<RefreshToken>
    implements IRefreshTokenRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'refresh_token' });
    }

    /**
     * Hash a token for secure storage
     */
    public static hashToken(token: string): string {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    /**
     * Generate a new refresh token string
     */
    public static generateToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Generate a new token family ID
     */
    public static generateFamilyId(): string {
        return crypto.randomBytes(16).toString('hex');
    }

    public async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
        const result = await this.knex(this.tableName)
            .where({ token_hash: tokenHash })
            .first();
        return result ? this.transformFromDBData(result) : null;
    }

    public async findValidByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
        const result = await this.knex(this.tableName)
            .where({ token_hash: tokenHash })
            .whereNull('revoked_at')
            .where('expires_at', '>', this.knex.fn.now())
            .first();
        return result ? this.transformFromDBData(result) : null;
    }

    /**
     * Atomically find a valid token and revoke it in a single transaction.
     * Uses SELECT FOR UPDATE to prevent concurrent refresh race conditions.
     * Returns the token if found and successfully revoked, null otherwise.
     */
    public async findAndRevokeValidToken(tokenHash: string): Promise<RefreshToken | null> {
        return this.knex.transaction(async (trx) => {
            const result = await trx(this.tableName)
                .where({ token_hash: tokenHash })
                .whereNull('revoked_at')
                .where('expires_at', '>', trx.fn.now())
                .forUpdate()
                .first();

            if (!result) return null;

            await trx(this.tableName)
                .where({ id: result.id })
                .update({ revoked_at: trx.fn.now() });

            return this.transformFromDBData(result);
        });
    }

    public async revokeToken(id: number): Promise<void> {
        await this.knex(this.tableName)
            .where({ id })
            .update({ revoked_at: this.knex.fn.now() });
    }

    public async revokeAllUserTokens(userId: number): Promise<void> {
        await this.knex(this.tableName)
            .where({ user_id: userId })
            .whereNull('revoked_at')
            .update({ revoked_at: this.knex.fn.now() });
    }

    public async revokeTokenFamily(familyId: string): Promise<void> {
        await this.knex(this.tableName)
            .where({ family_id: familyId })
            .whereNull('revoked_at')
            .update({ revoked_at: this.knex.fn.now() });
    }

    public async cleanupExpiredTokens(): Promise<number> {
        // Delete tokens that expired more than 7 days ago
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);

        return this.knex(this.tableName)
            .where('expires_at', '<', cutoffDate)
            .delete();
    }

    public async createRefreshToken(
        userId: number,
        familyId: string,
        expiresInDays: number = 30,
        ipAddress?: string,
        userAgent?: string
    ): Promise<{ token: string; refreshToken: RefreshToken }> {
        const token = RefreshTokenRepository.generateToken();
        const tokenHash = RefreshTokenRepository.hashToken(token);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);

        const refreshToken = await this.createOne({
            userId,
            tokenHash,
            familyId,
            expiresAt,
            ipAddress,
            userAgent,
        });

        return { token, refreshToken };
    }
}
