import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export enum SharePermission {
    VIEW = 'view',
    EDIT = 'edit',
}

export interface DashboardShare {
    id: number;
    dashboardId: number;
    userId: number;
    permission: SharePermission;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface DashboardShareWithUser extends DashboardShare {
    userEmail: string;
    userDisplayName: string;
}

export interface IDashboardShareRepository
    extends IBasicRepository<DashboardShare> {
    findByDashboardId(dashboardId: number): Promise<DashboardShareWithUser[]>;
    findByUserId(userId: number): Promise<DashboardShare[]>;
    findByDashboardAndUser(
        dashboardId: number,
        userId: number,
    ): Promise<DashboardShare | null>;
    deleteByDashboardAndUser(dashboardId: number, userId: number): Promise<boolean>;
}

export class DashboardShareRepository
    extends BaseRepository<DashboardShare>
    implements IDashboardShareRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'dashboard_share' });
    }

    public async findByDashboardId(
        dashboardId: number,
    ): Promise<DashboardShareWithUser[]> {
        const shares = await this.knex('dashboard_share')
            .select(
                'dashboard_share.*',
                'user.email as user_email',
                'user.display_name as user_display_name',
            )
            .join('user', 'dashboard_share.user_id', 'user.id')
            .where('dashboard_share.dashboard_id', dashboardId);

        return shares.map((share) => ({
            id: share.id,
            dashboardId: share.dashboard_id,
            userId: share.user_id,
            permission: share.permission as SharePermission,
            createdAt: share.created_at,
            updatedAt: share.updated_at,
            userEmail: share.user_email,
            userDisplayName: share.user_display_name,
        }));
    }

    public async findByUserId(userId: number): Promise<DashboardShare[]> {
        return this.findAllBy({ userId });
    }

    public async findByDashboardAndUser(
        dashboardId: number,
        userId: number,
    ): Promise<DashboardShare | null> {
        return this.findOneBy({ dashboardId, userId });
    }

    public async deleteByDashboardAndUser(
        dashboardId: number,
        userId: number,
    ): Promise<boolean> {
        const result = await this.knex('dashboard_share')
            .where({ dashboard_id: dashboardId, user_id: userId })
            .delete();
        return result > 0;
    }
}
