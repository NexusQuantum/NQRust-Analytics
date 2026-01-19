import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export interface OAuthAccount {
    id: number;
    userId: number;
    provider: string;
    providerUserId: string;
    providerEmail?: string;
    displayName?: string;
    avatarUrl?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export type OAuthProvider = 'google' | 'github';

export interface IOAuthAccountRepository extends IBasicRepository<OAuthAccount> {
    findByProviderAndUserId(provider: string, providerUserId: string): Promise<OAuthAccount | null>;
    findByUserAndProvider(userId: number, provider: string): Promise<OAuthAccount | null>;
    findAllByUser(userId: number): Promise<OAuthAccount[]>;
    linkAccount(data: Partial<OAuthAccount>): Promise<OAuthAccount>;
    unlinkAccount(userId: number, provider: string): Promise<void>;
    updateTokens(
        id: number,
        accessToken: string,
        refreshToken?: string,
        expiresAt?: Date
    ): Promise<void>;
}

export class OAuthAccountRepository
    extends BaseRepository<OAuthAccount>
    implements IOAuthAccountRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'oauth_account' });
    }

    public async findByProviderAndUserId(
        provider: string,
        providerUserId: string
    ): Promise<OAuthAccount | null> {
        const result = await this.knex(this.tableName)
            .where({ provider, provider_user_id: providerUserId })
            .first();
        return result ? this.transformFromDBData(result) : null;
    }

    public async findByUserAndProvider(
        userId: number,
        provider: string
    ): Promise<OAuthAccount | null> {
        const result = await this.knex(this.tableName)
            .where({ user_id: userId, provider })
            .first();
        return result ? this.transformFromDBData(result) : null;
    }

    public async findAllByUser(userId: number): Promise<OAuthAccount[]> {
        const results = await this.knex(this.tableName)
            .where({ user_id: userId })
            .orderBy('provider');
        return results.map(this.transformFromDBData);
    }

    public async linkAccount(data: Partial<OAuthAccount>): Promise<OAuthAccount> {
        return this.createOne(data);
    }

    public async unlinkAccount(userId: number, provider: string): Promise<void> {
        await this.knex(this.tableName)
            .where({ user_id: userId, provider })
            .delete();
    }

    public async updateTokens(
        id: number,
        accessToken: string,
        refreshToken?: string,
        expiresAt?: Date
    ): Promise<void> {
        const updates: Record<string, any> = {
            access_token: accessToken,
            updated_at: this.knex.fn.now(),
        };

        if (refreshToken) {
            updates.refresh_token = refreshToken;
        }
        if (expiresAt) {
            updates.token_expires_at = expiresAt;
        }

        await this.knex(this.tableName)
            .where({ id })
            .update(updates);
    }
}
