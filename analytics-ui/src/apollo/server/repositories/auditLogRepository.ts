import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export interface AuditLog {
    id: number;
    userId?: number;
    action: string;
    resourceType: string;
    resourceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    createdAt: Date;
}

export interface CreateAuditLogInput {
    userId?: number;
    action: string;
    resourceType: string;
    resourceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
}

export interface AuditLogFilter {
    userId?: number;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface IAuditLogRepository extends IBasicRepository<AuditLog> {
    log(input: CreateAuditLogInput): Promise<AuditLog>;
    findByFilter(filter: AuditLogFilter, limit?: number, offset?: number): Promise<AuditLog[]>;
    countByFilter(filter: AuditLogFilter): Promise<number>;
}

export class AuditLogRepository
    extends BaseRepository<AuditLog>
    implements IAuditLogRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'audit_log' });
    }

    public async log(input: CreateAuditLogInput): Promise<AuditLog> {
        const [result] = await this.knex(this.tableName)
            .insert({
                user_id: input.userId,
                action: input.action,
                resource_type: input.resourceType,
                resource_id: input.resourceId,
                details: input.details ? JSON.stringify(input.details) : null,
                ip_address: input.ipAddress,
                created_at: this.knex.fn.now(),
            })
            .returning('*');
        return this.transformFromDBData(result);
    }

    public async findByFilter(
        filter: AuditLogFilter,
        limit = 100,
        offset = 0
    ): Promise<AuditLog[]> {
        const query = this.knex(this.tableName);

        this.applyFilter(query, filter);

        const results = await query
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        return results.map((r: any) => this.transformFromDBData(r));
    }

    public async countByFilter(filter: AuditLogFilter): Promise<number> {
        const query = this.knex(this.tableName);

        this.applyFilter(query, filter);

        const result = await query.count('* as count').first();
        return Number(result?.count || 0);
    }

    private applyFilter(query: Knex.QueryBuilder, filter: AuditLogFilter): void {
        if (filter.userId) {
            query.where('user_id', filter.userId);
        }
        if (filter.action) {
            query.where('action', filter.action);
        }
        if (filter.resourceType) {
            query.where('resource_type', filter.resourceType);
        }
        if (filter.resourceId) {
            query.where('resource_id', filter.resourceId);
        }
        if (filter.startDate) {
            query.where('created_at', '>=', filter.startDate);
        }
        if (filter.endDate) {
            query.where('created_at', '<=', filter.endDate);
        }
    }

    protected override transformFromDBData = (data: any): AuditLog => {
        return {
            id: data.id,
            userId: data.user_id,
            action: data.action,
            resourceType: data.resource_type,
            resourceId: data.resource_id,
            details: data.details ? (typeof data.details === 'string' ? JSON.parse(data.details) : data.details) : undefined,
            ipAddress: data.ip_address,
            createdAt: data.created_at,
        };
    };
}

// Audit action constants
export const AuditActions = {
    // Auth actions
    LOGIN: 'auth.login',
    LOGOUT: 'auth.logout',
    REGISTER: 'auth.register',
    PASSWORD_CHANGE: 'auth.password_change',
    PASSWORD_RESET_REQUEST: 'auth.password_reset_request',
    PASSWORD_RESET: 'auth.password_reset',

    // User actions
    USER_CREATE: 'user.create',
    USER_UPDATE: 'user.update',
    USER_DELETE: 'user.delete',
    USER_ROLE_ASSIGN: 'user.role_assign',
    USER_ROLE_REMOVE: 'user.role_remove',

    // Role actions
    ROLE_CREATE: 'role.create',
    ROLE_UPDATE: 'role.update',
    ROLE_DELETE: 'role.delete',

    // Project member actions
    PROJECT_MEMBER_INVITE: 'project_member.invite',
    PROJECT_MEMBER_UPDATE: 'project_member.update',
    PROJECT_MEMBER_REMOVE: 'project_member.remove',

    // Model actions
    MODEL_CREATE: 'model.create',
    MODEL_UPDATE: 'model.update',
    MODEL_DELETE: 'model.delete',

    // View actions
    VIEW_CREATE: 'view.create',
    VIEW_DELETE: 'view.delete',

    // Deploy actions
    DEPLOY: 'deploy.execute',
} as const;
