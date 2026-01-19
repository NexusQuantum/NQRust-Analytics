import { Knex } from 'knex';
import { BaseRepository, IBasicRepository, IQueryOptions } from './baseRepository';

export type ProjectMemberRole = 'owner' | 'editor' | 'viewer';

export interface ProjectMember {
    id: number;
    projectId: number;
    userId: number;
    role: ProjectMemberRole;
    invitedBy?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProjectMemberWithUser extends ProjectMember {
    userEmail: string;
    userDisplayName: string;
    invitedByEmail?: string;
    invitedByDisplayName?: string;
}

export interface IProjectMemberRepository extends IBasicRepository<ProjectMember> {
    findByProjectAndUser(projectId: number, userId: number): Promise<ProjectMember | null>;
    findByProject(projectId: number): Promise<ProjectMemberWithUser[]>;
    findByUser(userId: number): Promise<ProjectMember[]>;
    isProjectOwner(projectId: number, userId: number): Promise<boolean>;
    canAccessProject(projectId: number, userId: number): Promise<boolean>;
    canEditProject(projectId: number, userId: number): Promise<boolean>;
}

export class ProjectMemberRepository
    extends BaseRepository<ProjectMember>
    implements IProjectMemberRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'project_member' });
    }

    public async findByProjectAndUser(
        projectId: number,
        userId: number
    ): Promise<ProjectMember | null> {
        const result = await this.knex(this.tableName)
            .where({ project_id: projectId, user_id: userId })
            .first();
        return result ? this.transformFromDBData(result) : null;
    }

    public async findByProject(projectId: number): Promise<ProjectMemberWithUser[]> {
        const members = await this.knex(this.tableName)
            .select(
                'project_member.*',
                'u.email as user_email',
                'u.display_name as user_display_name',
                'inviter.email as invited_by_email',
                'inviter.display_name as invited_by_display_name'
            )
            .leftJoin('user as u', 'project_member.user_id', 'u.id')
            .leftJoin('user as inviter', 'project_member.invited_by', 'inviter.id')
            .where('project_member.project_id', projectId)
            .orderBy('project_member.created_at', 'asc');

        return members.map((m: any) => ({
            id: m.id,
            projectId: m.project_id,
            userId: m.user_id,
            role: m.role,
            invitedBy: m.invited_by,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
            userEmail: m.user_email,
            userDisplayName: m.user_display_name,
            invitedByEmail: m.invited_by_email,
            invitedByDisplayName: m.invited_by_display_name,
        }));
    }

    public async findByUser(userId: number): Promise<ProjectMember[]> {
        return this.findAllBy({ userId } as Partial<ProjectMember>);
    }

    public async isProjectOwner(projectId: number, userId: number): Promise<boolean> {
        const member = await this.findByProjectAndUser(projectId, userId);
        return member?.role === 'owner';
    }

    public async canAccessProject(projectId: number, userId: number): Promise<boolean> {
        const member = await this.findByProjectAndUser(projectId, userId);
        return !!member;
    }

    public async canEditProject(projectId: number, userId: number): Promise<boolean> {
        const member = await this.findByProjectAndUser(projectId, userId);
        return member?.role === 'owner' || member?.role === 'editor';
    }

    public async updateMemberRole(
        memberId: number,
        role: ProjectMemberRole,
        queryOptions?: IQueryOptions
    ): Promise<ProjectMember> {
        const executer = queryOptions?.tx ? queryOptions.tx : this.knex;
        const [result] = await executer(this.tableName)
            .where({ id: memberId })
            .update({ role, updated_at: this.knex.fn.now() })
            .returning('*');
        return this.transformFromDBData(result);
    }

    public async transferOwnership(
        projectId: number,
        currentOwnerId: number,
        newOwnerId: number,
        queryOptions?: IQueryOptions
    ): Promise<void> {
        const executer = queryOptions?.tx ? queryOptions.tx : this.knex;

        // Demote current owner to editor
        await executer(this.tableName)
            .where({ project_id: projectId, user_id: currentOwnerId })
            .update({ role: 'editor', updated_at: this.knex.fn.now() });

        // Promote new owner
        await executer(this.tableName)
            .where({ project_id: projectId, user_id: newOwnerId })
            .update({ role: 'owner', updated_at: this.knex.fn.now() });
    }
}
