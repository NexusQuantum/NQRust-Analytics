import { IContext } from '../types';
import { UserRepository, UserWithRoles, User, Role } from '../repositories/userRepository';
import { RoleRepository, RoleWithPermissions } from '../repositories/roleRepository';
import { ProjectMemberRepository, ProjectMemberWithUser, ProjectMemberRole } from '../repositories/projectMemberRepository';
import { AuditLogRepository, AuditActions } from '../repositories/auditLogRepository';
import { AuthUtils, AuthServiceError } from '../utils/authUtils';
import { GraphQLError } from 'graphql';
import { Knex } from 'knex';

// Extended context interface for auth - user added by getToken() in graphql.ts
export interface AuthContext extends Omit<IContext, 'user'> {
    user: UserWithRoles | null;
    ipAddress?: string;
    knex: Knex;
}

export class AuthResolver {
    private createRepositories(knex: Knex) {
        const userRepository = new UserRepository(knex);
        const roleRepository = new RoleRepository(knex);
        const projectMemberRepository = new ProjectMemberRepository(knex);
        const auditLogRepository = new AuditLogRepository(knex);

        return {
            userRepository,
            roleRepository,
            projectMemberRepository,
            auditLogRepository,
        };
    }

    private getKnex(ctx: IContext): Knex {
        const projectRepo = ctx.projectRepository as any;
        if (projectRepo?.knex) {
            return projectRepo.knex;
        }
        throw new Error('Database connection not available');
    }

    private requireAuth(ctx: AuthContext): UserWithRoles {
        if (!ctx.user) {
            throw new GraphQLError('Authentication required', {
                extensions: { code: 'UNAUTHENTICATED' },
            });
        }
        return ctx.user;
    }

    private async requireAdmin(ctx: AuthContext): Promise<UserWithRoles> {
        const user = this.requireAuth(ctx);
        const knex = this.getKnex(ctx);
        const { userRepository } = this.createRepositories(knex);
        const roles = await userRepository.getUserRoles(user.id);
        if (!roles.some(r => r.name === 'admin')) {
            throw new GraphQLError('Admin access required', {
                extensions: { code: 'FORBIDDEN' },
            });
        }
        return user;
    }

    private async getCurrentProjectId(ctx: IContext): Promise<number> {
        const project = await ctx.projectRepository.getCurrentProject();
        return project.id;
    }

    // ===== Query Resolvers =====

    me = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        return authCtx.user ?? null;
    };

    users = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        await this.requireAdmin(authCtx);

        const users = await repos.userRepository.findAll();
        return Promise.all(
            users.map(async (user) => repos.userRepository.findByIdWithRoles(user.id))
        );
    };

    user = async (
        _root: unknown,
        args: { where: { id: number } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        await this.requireAdmin(authCtx);
        return repos.userRepository.findByIdWithRoles(args.where.id);
    };

    roles = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const { roleRepository } = this.createRepositories(knex);

        const roles = await roleRepository.findAll();
        return Promise.all(
            roles.map(async (role) => roleRepository.findByIdWithPermissions(role.id))
        );
    };

    role = async (
        _root: unknown,
        args: { where: { id: number } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const { roleRepository } = this.createRepositories(knex);
        return roleRepository.findByIdWithPermissions(args.where.id);
    };

    permissions = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const { roleRepository } = this.createRepositories(knex);
        return roleRepository.getAllPermissions();
    };

    projectMembers = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const { projectMemberRepository } = this.createRepositories(knex);

        const projectId = await this.getCurrentProjectId(ctx);
        return projectMemberRepository.findByProject(projectId);
    };

    // ===== Auth Mutation Resolvers =====

    register = async (
        _root: unknown,
        args: { data: { email: string; password: string; displayName: string } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const { userRepository, roleRepository, auditLogRepository } = this.createRepositories(knex);

        try {
            const result = await AuthUtils.register(
                { userRepository, roleRepository, auditLogRepository },
                args.data,
                authCtx.ipAddress
            );
            return { user: result.user };
        } catch (error) {
            if (error instanceof AuthServiceError) {
                throw new Error(error.message);
            }
            throw error;
        }
    };

    changePassword = async (
        _root: unknown,
        args: { data: { oldPassword: string; newPassword: string } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const user = this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const { userRepository, auditLogRepository } = this.createRepositories(knex);

        try {
            await AuthUtils.changePassword(
                { userRepository, auditLogRepository },
                user.id,
                args.data.oldPassword,
                args.data.newPassword,
                authCtx.ipAddress
            );
            return true;
        } catch (error) {
            if (error instanceof AuthServiceError) {
                throw new Error(error.message);
            }
            throw error;
        }
    };

    requestPasswordReset = async (
        _root: unknown,
        args: { email: string },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const { userRepository, auditLogRepository } = this.createRepositories(knex);
        await AuthUtils.requestPasswordReset(
            { userRepository, auditLogRepository },
            args.email,
            authCtx.ipAddress
        );
        return true;
    };

    // ===== User Management Mutation Resolvers =====

    createUser = async (
        _root: unknown,
        args: {
            data: {
                email: string;
                password: string;
                displayName: string;
                roleIds?: number[];
            };
        },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        const currentUser = await this.requireAdmin(authCtx);

        const result = await AuthUtils.register(
            {
                userRepository: repos.userRepository,
                roleRepository: repos.roleRepository,
                auditLogRepository: repos.auditLogRepository,
            },
            {
                email: args.data.email,
                password: args.data.password,
                displayName: args.data.displayName,
            },
            authCtx.ipAddress
        );

        if (args.data.roleIds && args.data.roleIds.length > 0) {
            for (const roleId of args.data.roleIds) {
                await repos.userRepository.assignRole(result.user.id, roleId);
            }
        }

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.USER_CREATE,
            resourceType: 'user',
            resourceId: result.user.id.toString(),
            ipAddress: authCtx.ipAddress,
        });

        return repos.userRepository.findByIdWithRoles(result.user.id);
    };

    updateUser = async (
        _root: unknown,
        args: {
            where: { id: number };
            data: { displayName?: string; isActive?: boolean; roleIds?: number[] };
        },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        const currentUser = await this.requireAdmin(authCtx);

        const updateData: Partial<User> = {};
        if (args.data.displayName !== undefined) {
            updateData.displayName = args.data.displayName;
        }
        if (args.data.isActive !== undefined) {
            updateData.isActive = args.data.isActive;
        }

        if (Object.keys(updateData).length > 0) {
            await repos.userRepository.updateOne(args.where.id, updateData);
        }

        if (args.data.roleIds !== undefined) {
            const currentRoles = await repos.userRepository.getUserRoles(args.where.id);
            const currentRoleIds = new Set(currentRoles.map(r => r.id));
            const newRoleIds = new Set(args.data.roleIds);

            for (const role of currentRoles) {
                if (!newRoleIds.has(role.id)) {
                    await repos.userRepository.removeRole(args.where.id, role.id);
                }
            }

            for (const roleId of args.data.roleIds) {
                if (!currentRoleIds.has(roleId)) {
                    await repos.userRepository.assignRole(args.where.id, roleId);
                }
            }
        }

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.USER_UPDATE,
            resourceType: 'user',
            resourceId: args.where.id.toString(),
            details: args.data,
            ipAddress: authCtx.ipAddress,
        });

        return repos.userRepository.findByIdWithRoles(args.where.id);
    };

    deleteUser = async (
        _root: unknown,
        args: { where: { id: number } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        const currentUser = await this.requireAdmin(authCtx);

        if (args.where.id === currentUser.id) {
            throw new Error('Cannot delete your own account');
        }

        await repos.userRepository.deleteOne(args.where.id.toString());

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.USER_DELETE,
            resourceType: 'user',
            resourceId: args.where.id.toString(),
            ipAddress: authCtx.ipAddress,
        });

        return true;
    };

    // ===== Role Management Mutation Resolvers =====

    createRole = async (
        _root: unknown,
        args: {
            data: { name: string; description?: string; permissionIds: number[] };
        },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        const currentUser = await this.requireAdmin(authCtx);

        const role = await repos.roleRepository.createOne({
            name: args.data.name.toLowerCase(),
            description: args.data.description,
            isSystem: false,
        });

        await repos.roleRepository.setPermissions(role.id, args.data.permissionIds);

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.ROLE_CREATE,
            resourceType: 'role',
            resourceId: role.id.toString(),
            ipAddress: authCtx.ipAddress,
        });

        return repos.roleRepository.findByIdWithPermissions(role.id);
    };

    updateRole = async (
        _root: unknown,
        args: {
            where: { id: number };
            data: { name?: string; description?: string; permissionIds?: number[] };
        },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        const currentUser = await this.requireAdmin(authCtx);

        const role = await repos.roleRepository.findOneBy({ id: args.where.id } as Partial<Role>);
        if (!role) {
            throw new Error('Role not found');
        }

        if (role.isSystem) {
            throw new Error('Cannot modify system roles');
        }

        const updateData: Partial<Role> = {};
        if (args.data.name !== undefined) {
            updateData.name = args.data.name.toLowerCase();
        }
        if (args.data.description !== undefined) {
            updateData.description = args.data.description;
        }

        if (Object.keys(updateData).length > 0) {
            await repos.roleRepository.updateOne(args.where.id, updateData);
        }

        if (args.data.permissionIds !== undefined) {
            await repos.roleRepository.setPermissions(args.where.id, args.data.permissionIds);
        }

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.ROLE_UPDATE,
            resourceType: 'role',
            resourceId: args.where.id.toString(),
            details: args.data,
            ipAddress: authCtx.ipAddress,
        });

        return repos.roleRepository.findByIdWithPermissions(args.where.id);
    };

    deleteRole = async (
        _root: unknown,
        args: { where: { id: number } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        const currentUser = await this.requireAdmin(authCtx);

        const role = await repos.roleRepository.findOneBy({ id: args.where.id } as Partial<Role>);
        if (!role) {
            throw new Error('Role not found');
        }

        if (role.isSystem) {
            throw new Error('Cannot delete system roles');
        }

        await repos.roleRepository.deleteOne(args.where.id.toString());

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.ROLE_DELETE,
            resourceType: 'role',
            resourceId: args.where.id.toString(),
            ipAddress: authCtx.ipAddress,
        });

        return true;
    };

    // ===== Project Member Mutation Resolvers =====

    inviteProjectMember = async (
        _root: unknown,
        args: { data: { email: string; role: 'OWNER' | 'EDITOR' | 'VIEWER' } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const currentUser = this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);

        const projectId = await this.getCurrentProjectId(ctx);

        const canEdit = await repos.projectMemberRepository.canEditProject(projectId, currentUser.id);
        if (!canEdit) {
            throw new Error('You do not have permission to invite members');
        }

        const invitedUser = await repos.userRepository.findByEmail(args.data.email);
        if (!invitedUser) {
            throw new Error('User not found with this email');
        }

        const existingMember = await repos.projectMemberRepository.findByProjectAndUser(
            projectId,
            invitedUser.id
        );
        if (existingMember) {
            throw new Error('User is already a member of this project');
        }

        const member = await repos.projectMemberRepository.createOne({
            projectId,
            userId: invitedUser.id,
            role: args.data.role.toLowerCase() as ProjectMemberRole,
            invitedBy: currentUser.id,
        });

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.PROJECT_MEMBER_INVITE,
            resourceType: 'project_member',
            resourceId: member.id.toString(),
            details: { email: args.data.email, role: args.data.role },
            ipAddress: authCtx.ipAddress,
        });

        const members = await repos.projectMemberRepository.findByProject(projectId);
        return members.find(m => m.id === member.id);
    };

    updateProjectMember = async (
        _root: unknown,
        args: {
            where: { id: number };
            data: { role: 'OWNER' | 'EDITOR' | 'VIEWER' };
        },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const currentUser = this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);

        const projectId = await this.getCurrentProjectId(ctx);

        const isOwner = await repos.projectMemberRepository.isProjectOwner(projectId, currentUser.id);
        if (!isOwner) {
            throw new Error('Only project owner can change member roles');
        }

        const member = await repos.projectMemberRepository.updateMemberRole(
            args.where.id,
            args.data.role.toLowerCase() as ProjectMemberRole
        );

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.PROJECT_MEMBER_UPDATE,
            resourceType: 'project_member',
            resourceId: args.where.id.toString(),
            details: { role: args.data.role },
            ipAddress: authCtx.ipAddress,
        });

        const members = await repos.projectMemberRepository.findByProject(projectId);
        return members.find(m => m.id === member.id);
    };

    removeProjectMember = async (
        _root: unknown,
        args: { where: { id: number } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const currentUser = this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);

        const projectId = await this.getCurrentProjectId(ctx);

        const isOwner = await repos.projectMemberRepository.isProjectOwner(projectId, currentUser.id);
        if (!isOwner) {
            throw new Error('Only project owner can remove members');
        }

        await repos.projectMemberRepository.deleteOne(args.where.id.toString());

        await repos.auditLogRepository.log({
            userId: currentUser.id,
            action: AuditActions.PROJECT_MEMBER_REMOVE,
            resourceType: 'project_member',
            resourceId: args.where.id.toString(),
            ipAddress: authCtx.ipAddress,
        });

        return true;
    };

    // ===== Nested Resolvers =====

    getUserNestedResolver() {
        return {
            roles: async (user: UserWithRoles, _args: unknown, ctx: IContext) => {
                if (user.roles) return user.roles;
                const knex = this.getKnex(ctx);
                const { userRepository } = this.createRepositories(knex);
                return userRepository.getUserRoles(user.id);
            },
        };
    }

    getRoleNestedResolver() {
        return {
            permissions: async (role: RoleWithPermissions, _args: unknown, ctx: IContext) => {
                if (role.permissions) return role.permissions;
                const knex = this.getKnex(ctx);
                const { roleRepository } = this.createRepositories(knex);
                return roleRepository.getRolePermissions(role.id);
            },
        };
    }

    getProjectMemberNestedResolver() {
        return {
            user: async (member: ProjectMemberWithUser, _args: unknown, ctx: IContext) => {
                const knex = this.getKnex(ctx);
                const { userRepository } = this.createRepositories(knex);
                return userRepository.findByIdWithRoles(member.userId);
            },
            invitedBy: async (member: ProjectMemberWithUser, _args: unknown, ctx: IContext) => {
                if (!member.invitedBy) return null;
                const knex = this.getKnex(ctx);
                const { userRepository } = this.createRepositories(knex);
                return userRepository.findByIdWithRoles(member.invitedBy);
            },
        };
    }
}
