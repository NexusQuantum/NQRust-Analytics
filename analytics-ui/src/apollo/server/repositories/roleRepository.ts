import { Knex } from 'knex';
import { BaseRepository, IBasicRepository, IQueryOptions } from './baseRepository';
import { Permission } from './userRepository';

export interface Role {
    id: number;
    name: string;
    description?: string;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface RoleWithPermissions extends Role {
    permissions: Permission[];
}

export interface RolePermission {
    id: number;
    roleId: number;
    permissionId: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface IRoleRepository extends IBasicRepository<Role> {
    findByName(name: string): Promise<Role | null>;
    findByIdWithPermissions(id: number): Promise<RoleWithPermissions | null>;
    getRolePermissions(roleId: number): Promise<Permission[]>;
    assignPermission(roleId: number, permissionId: number, queryOptions?: IQueryOptions): Promise<void>;
    removePermission(roleId: number, permissionId: number, queryOptions?: IQueryOptions): Promise<void>;
    setPermissions(roleId: number, permissionIds: number[], queryOptions?: IQueryOptions): Promise<void>;
}

export class RoleRepository
    extends BaseRepository<Role>
    implements IRoleRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'role' });
    }

    public async findByName(name: string): Promise<Role | null> {
        const result = await this.knex(this.tableName)
            .where({ name: name.toLowerCase() })
            .first();
        return result ? this.transformFromDBData(result) : null;
    }

    public async findByIdWithPermissions(id: number): Promise<RoleWithPermissions | null> {
        const role = await this.findOneBy({ id } as Partial<Role>);
        if (!role) return null;

        const permissions = await this.getRolePermissions(id);
        return { ...role, permissions };
    }

    public async getRolePermissions(roleId: number): Promise<Permission[]> {
        const permissions = await this.knex('permission')
            .select('permission.*')
            .join('role_permission', 'permission.id', 'role_permission.permission_id')
            .where('role_permission.role_id', roleId);

        return permissions.map((p: any) => this.transformPermissionFromDB(p));
    }

    public async assignPermission(
        roleId: number,
        permissionId: number,
        queryOptions?: IQueryOptions
    ): Promise<void> {
        const executer = queryOptions?.tx ? queryOptions.tx : this.knex;
        await executer('role_permission').insert({
            role_id: roleId,
            permission_id: permissionId,
            created_at: this.knex.fn.now(),
            updated_at: this.knex.fn.now(),
        }).onConflict(['role_id', 'permission_id']).ignore();
    }

    public async removePermission(
        roleId: number,
        permissionId: number,
        queryOptions?: IQueryOptions
    ): Promise<void> {
        const executer = queryOptions?.tx ? queryOptions.tx : this.knex;
        await executer('role_permission')
            .where({ role_id: roleId, permission_id: permissionId })
            .delete();
    }

    public async setPermissions(
        roleId: number,
        permissionIds: number[],
        queryOptions?: IQueryOptions
    ): Promise<void> {
        const executer = queryOptions?.tx ? queryOptions.tx : this.knex;

        // Remove all existing permissions
        await executer('role_permission')
            .where({ role_id: roleId })
            .delete();

        // Add new permissions
        if (permissionIds.length > 0) {
            const inserts = permissionIds.map(permissionId => ({
                role_id: roleId,
                permission_id: permissionId,
                created_at: this.knex.fn.now(),
                updated_at: this.knex.fn.now(),
            }));
            await executer('role_permission').insert(inserts);
        }
    }

    public async getAllPermissions(): Promise<Permission[]> {
        const permissions = await this.knex('permission').select('*');
        return permissions.map((p: any) => this.transformPermissionFromDB(p));
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
}
