import { Knex } from 'knex';
import { BaseRepository, IBasicRepository, IQueryOptions } from './baseRepository';

export interface User {
    id: number;
    email: string;
    passwordHash: string;
    displayName: string;
    avatarUrl?: string;
    isActive: boolean;
    isVerified: boolean;
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserWithRoles extends User {
    roles: Role[];
}

export interface Role {
    id: number;
    name: string;
    description?: string;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Permission {
    id: number;
    name: string;
    resource: string;
    action: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserRole {
    id: number;
    userId: number;
    roleId: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserRepository extends IBasicRepository<User> {
    findByEmail(email: string): Promise<User | null>;
    findByIdWithRoles(id: number): Promise<UserWithRoles | null>;
    updateLastLogin(userId: number): Promise<void>;
    getUserRoles(userId: number): Promise<Role[]>;
    assignRole(userId: number, roleId: number, queryOptions?: IQueryOptions): Promise<void>;
    removeRole(userId: number, roleId: number, queryOptions?: IQueryOptions): Promise<void>;
    hasPermission(userId: number, resource: string, action: string): Promise<boolean>;
}

export class UserRepository
    extends BaseRepository<User>
    implements IUserRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'user' });
    }

    public async findByEmail(email: string): Promise<User | null> {
        const result = await this.knex(this.tableName)
            .where({ email: email.toLowerCase() })
            .first();
        return result ? this.transformFromDBData(result) : null;
    }

    public async findByIdWithRoles(id: number): Promise<UserWithRoles | null> {
        const user = await this.findOneBy({ id } as Partial<User>);
        if (!user) return null;

        const roles = await this.getUserRoles(id);
        return { ...user, roles };
    }

    public async updateLastLogin(userId: number): Promise<void> {
        await this.knex(this.tableName)
            .where({ id: userId })
            .update({ last_login_at: this.knex.fn.now() });
    }

    public async getUserRoles(userId: number): Promise<Role[]> {
        const roles = await this.knex('role')
            .select('role.*')
            .join('user_role', 'role.id', 'user_role.role_id')
            .where('user_role.user_id', userId);

        return roles.map((role: any) => this.transformRoleFromDB(role));
    }

    public async assignRole(
        userId: number,
        roleId: number,
        queryOptions?: IQueryOptions
    ): Promise<void> {
        const executer = queryOptions?.tx ? queryOptions.tx : this.knex;
        await executer('user_role').insert({
            user_id: userId,
            role_id: roleId,
            created_at: this.knex.fn.now(),
            updated_at: this.knex.fn.now(),
        }).onConflict(['user_id', 'role_id']).ignore();
    }

    public async removeRole(
        userId: number,
        roleId: number,
        queryOptions?: IQueryOptions
    ): Promise<void> {
        const executer = queryOptions?.tx ? queryOptions.tx : this.knex;
        await executer('user_role')
            .where({ user_id: userId, role_id: roleId })
            .delete();
    }

    public async hasPermission(
        userId: number,
        resource: string,
        action: string
    ): Promise<boolean> {
        const result = await this.knex('permission')
            .select('permission.id')
            .join('role_permission', 'permission.id', 'role_permission.permission_id')
            .join('user_role', 'role_permission.role_id', 'user_role.role_id')
            .where('user_role.user_id', userId)
            .where('permission.resource', resource)
            .where('permission.action', action)
            .first();

        return !!result;
    }

    public async getUserPermissions(userId: number): Promise<Permission[]> {
        const permissions = await this.knex('permission')
            .select('permission.*')
            .join('role_permission', 'permission.id', 'role_permission.permission_id')
            .join('user_role', 'role_permission.role_id', 'user_role.role_id')
            .where('user_role.user_id', userId)
            .distinct();

        return permissions.map((p: any) => this.transformPermissionFromDB(p));
    }

    private transformRoleFromDB(data: any): Role {
        return {
            id: data.id,
            name: data.name,
            description: data.description,
            isSystem: data.is_system,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
    }

    private transformPermissionFromDB(data: any): Permission {
        return {
            id: data.id,
            name: data.name,
            resource: data.resource,
            action: data.action,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
    }

    // Override create to ensure email is lowercase
    public override async createOne(
        data: Partial<User>,
        queryOptions?: IQueryOptions
    ): Promise<User> {
        const normalizedData = {
            ...data,
            email: data.email?.toLowerCase(),
        };
        return super.createOne(normalizedData, queryOptions);
    }
}
