import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';
import { ScheduleFrequencyEnum } from '@server/models/dashboard';

export interface Dashboard {
  id: number;
  projectId: number;
  name: string;
  description?: string;
  isDefault: boolean;
  createdBy: number | null;
  cacheEnabled: boolean;
  scheduleFrequency: ScheduleFrequencyEnum | null;
  scheduleTimezone: string | null;
  scheduleCron: string | null;
  nextScheduledAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DashboardWithCreator extends Dashboard {
  creatorEmail?: string;
  creatorDisplayName?: string;
}

export interface IDashboardRepository extends IBasicRepository<Dashboard> {
  findByProjectId(projectId: number): Promise<Dashboard[]>;
  findAccessibleByUser(
    projectId: number,
    userId: number,
  ): Promise<DashboardWithCreator[]>;
  findDefaultByUser(
    projectId: number,
    userId: number,
  ): Promise<Dashboard | null>;
  setDefault(dashboardId: number, userId: number): Promise<void>;
}

export class DashboardRepository
  extends BaseRepository<Dashboard>
  implements IDashboardRepository {
  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'dashboard' });
  }

  public async findByProjectId(projectId: number): Promise<Dashboard[]> {
    return this.findAllBy({ projectId });
  }

  /**
   * Find all dashboards accessible by a user:
   * - Dashboards created by the user
   * - Dashboards shared with the user
   */
  public async findAccessibleByUser(
    projectId: number,
    userId: number,
  ): Promise<DashboardWithCreator[]> {
    const results = await this.knex('dashboard')
      .select(
        'dashboard.*',
        'creator.email as creator_email',
        'creator.display_name as creator_display_name',
      )
      .leftJoin('user as creator', 'dashboard.created_by', 'creator.id')
      .leftJoin('dashboard_share', 'dashboard.id', 'dashboard_share.dashboard_id')
      .where('dashboard.project_id', projectId)
      .andWhere(function () {
        this.where('dashboard.created_by', userId).orWhere(
          'dashboard_share.user_id',
          userId,
        );
      })
      .groupBy('dashboard.id', 'creator.email', 'creator.display_name')
      .orderBy('dashboard.created_at', 'desc');

    return results.map((row) => this.transformFromDBData(row));
  }

  /**
   * Find the default dashboard for a user in a project
   */
  public async findDefaultByUser(
    projectId: number,
    userId: number,
  ): Promise<Dashboard | null> {
    const result = await this.knex('dashboard')
      .where({
        project_id: projectId,
        created_by: userId,
        is_default: true,
      })
      .first();

    return result ? this.transformFromDBData(result) : null;
  }

  /**
   * Set a dashboard as the default for its owner
   * (unsets the previous default for that user in the same project)
   */
  public async setDefault(dashboardId: number, userId: number): Promise<void> {
    const dashboard = await this.findOneBy({ id: dashboardId });
    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    // Use a transaction to atomically swap the default dashboard,
    // preventing concurrent calls from leaving multiple defaults.
    await this.knex.transaction(async (trx) => {
      // Unset all other defaults for this user in this project
      await trx('dashboard')
        .where({
          project_id: dashboard.projectId,
          created_by: userId,
        })
        .update({ is_default: false });

      // Set the new default
      await trx('dashboard')
        .where({ id: dashboardId })
        .update({ is_default: true });
    });
  }

  protected transformFromDBData = (data: any): DashboardWithCreator => {
    return {
      id: data.id,
      projectId: data.project_id,
      name: data.name,
      description: data.description,
      isDefault: data.is_default,
      createdBy: data.created_by,
      cacheEnabled: data.cache_enabled,
      scheduleFrequency: data.schedule_frequency,
      scheduleTimezone: data.schedule_timezone,
      scheduleCron: data.schedule_cron,
      nextScheduledAt: data.next_scheduled_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      creatorEmail: data.creator_email,
      creatorDisplayName: data.creator_display_name,
    };
  }
}
