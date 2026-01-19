import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export interface StarredDashboard {
  id: number;
  dashboardId: number;
  userId: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStarredDashboardRepository extends IBasicRepository<StarredDashboard> {
  findByUser(userId: number): Promise<StarredDashboard[]>;
  isStarred(dashboardId: number, userId: number): Promise<boolean>;
  star(dashboardId: number, userId: number): Promise<StarredDashboard>;
  unstar(dashboardId: number, userId: number): Promise<boolean>;
  getStarredDashboardIds(userId: number): Promise<number[]>;
}

export class StarredDashboardRepository
  extends BaseRepository<StarredDashboard>
  implements IStarredDashboardRepository {
  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'starred_dashboard' });
  }

  public async findByUser(userId: number): Promise<StarredDashboard[]> {
    return this.findAllBy({ userId });
  }

  public async isStarred(dashboardId: number, userId: number): Promise<boolean> {
    const result = await this.knex(this.tableName)
      .where({
        dashboard_id: dashboardId,
        user_id: userId,
      })
      .first();
    return !!result;
  }

  public async star(dashboardId: number, userId: number): Promise<StarredDashboard> {
    // Use upsert to handle duplicate case
    const [result] = await this.knex(this.tableName)
      .insert({
        dashboard_id: dashboardId,
        user_id: userId,
      })
      .onConflict(['dashboard_id', 'user_id'])
      .ignore()
      .returning('*');

    if (!result) {
      // Already exists, fetch it
      const existing = await this.knex(this.tableName)
        .where({
          dashboard_id: dashboardId,
          user_id: userId,
        })
        .first();
      return this.transformFromDBData(existing);
    }

    return this.transformFromDBData(result);
  }

  public async unstar(dashboardId: number, userId: number): Promise<boolean> {
    const deleted = await this.knex(this.tableName)
      .where({
        dashboard_id: dashboardId,
        user_id: userId,
      })
      .delete();
    return deleted > 0;
  }

  public async getStarredDashboardIds(userId: number): Promise<number[]> {
    const results = await this.knex(this.tableName)
      .where({ user_id: userId })
      .select('dashboard_id');
    return results.map((r) => r.dashboard_id);
  }

  protected transformFromDBData = (data: any): StarredDashboard => {
    return {
      id: data.id,
      dashboardId: data.dashboard_id,
      userId: data.user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  };
}
