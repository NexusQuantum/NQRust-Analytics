import { IContext } from '../types';
import { UserRepository, UserWithRoles, User, Role } from '../repositories/userRepository';
import { RoleRepository, RoleWithPermissions } from '../repositories/roleRepository';
import { ProjectMemberRepository, ProjectMemberWithUser, ProjectMemberRole } from '../repositories/projectMemberRepository';
import { AuditLogRepository, AuditActions } from '../repositories/auditLogRepository';
import { RefreshTokenRepository } from '../repositories/refreshTokenRepository';
import { AuthService, AuthPayload, AuthServiceError } from '../services/authService';
import { RateLimitService } from '../services/rateLimitService';
import { GraphQLError } from 'graphql';
import { Knex } from 'knex';

// Extended context interface for auth - user will be added by auth middleware
export interface AuthContext extends Omit<IContext, 'user'> {
    user: UserWithRoles | null;
    ipAddress?: string;
    knex: Knex; // Add knex connection from the context
}

export class AuthResolver {
    // Create repositories from knex connection in context
    private createRepositories(knex: Knex) {
        const userRepository = new UserRepository(knex);
        const roleRepository = new RoleRepository(knex);
        const projectMemberRepository = new ProjectMemberRepository(knex);
        const auditLogRepository = new AuditLogRepository(knex);
        const refreshTokenRepository = new RefreshTokenRepository(knex);
        const rateLimitService = new RateLimitService(knex);
        const authService = new AuthService(
            userRepository,
            roleRepository,
            auditLogRepository,
            refreshTokenRepository
        );

        return {
            userRepository,
            roleRepository,
            projectMemberRepository,
            auditLogRepository,
            refreshTokenRepository,
            rateLimitService,
            authService,
        };
    }

    private getKnex(ctx: IContext): Knex {
        // Access knex through the project repository (it extends BaseRepository which has knex)
        // This is a workaround since knex isn't directly on IContext
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

    private async requireAdmin(ctx: AuthContext, authService: AuthService): Promise<UserWithRoles> {
        const user = this.requireAuth(ctx);
        if (!(await authService.isAdmin(user.id))) {
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
        if (!authCtx.user) return null;
        const knex = this.getKnex(ctx);
        const { userRepository } = this.createRepositories(knex);
        return userRepository.findByIdWithRoles(authCtx.user.id);
    };

    users = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const repos = this.createRepositories(knex);
        await this.requireAdmin(authCtx, repos.authService);

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
        await this.requireAdmin(authCtx, repos.authService);
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
    ): Promise<AuthPayload> => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const { authService } = this.createRepositories(knex);

        try {
            return await authService.register(args.data, authCtx.ipAddress);
        } catch (error) {
            if (error instanceof AuthServiceError) {
                throw new Error(error.message);
            }
            throw error;
        }
    };

    login = async (
        _root: unknown,
        args: { data: { email: string; password: string } },
        ctx: IContext
    ): Promise<AuthPayload> => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const { authService, rateLimitService } = this.createRepositories(knex);
        const ipAddress = authCtx.ipAddress || 'unknown';
        const email = args.data.email;

        // Check rate limit before processing login
        const rateLimitResult = await rateLimitService.checkLoginLimit(ipAddress, email);
        if (!rateLimitResult.allowed) {
            const retryAfterSec = Math.ceil((rateLimitResult.retryAfterMs || 0) / 1000);
            const message = rateLimitResult.reason === 'ACCOUNT_LOCKED'
                ? `Account temporarily locked. Try again in ${retryAfterSec} seconds.`
                : `Too many login attempts. Try again in ${retryAfterSec} seconds.`;

            // Record the rate-limited attempt
            await rateLimitService.recordLoginAttempt(
                email,
                ipAddress,
                false,
                undefined,
                undefined,
                rateLimitResult.reason
            );

            throw new Error(message);
        }

        try {
            const result = await authService.login(args.data, authCtx.ipAddress);

            // Record successful login
            await rateLimitService.recordLoginAttempt(
                email,
                ipAddress,
                true,
                result.user.id
            );

            return result;
        } catch (error) {
            // Record failed login attempt
            const failureReason = error instanceof AuthServiceError ? error.code : 'UNKNOWN';
            await rateLimitService.recordLoginAttempt(
                email,
                ipAddress,
                false,
                undefined,
                undefined,
                failureReason
            );

            if (error instanceof AuthServiceError) {
                throw new Error(error.message);
            }
            throw error;
        }
    };

    logout = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        if (authCtx.user) {
            const knex = this.getKnex(ctx);
            const { authService } = this.createRepositories(knex);
            await authService.logout(authCtx.user.id, authCtx.ipAddress);
        }
        return true;
    };

    changePassword = async (
        _root: unknown,
        args: { data: { oldPassword: string; newPassword: string } },
        ctx: IContext
    ) => {
        const authCtx = ctx as AuthContext;
        const user = this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const { authService } = this.createRepositories(knex);

        try {
            await authService.changePassword(
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
        const { authService } = this.createRepositories(knex);
        await authService.requestPasswordReset(args.email, authCtx.ipAddress);
        return true;
    };

    refreshToken = async (
        _root: unknown,
        args: { refreshToken: string },
        ctx: IContext
    ): Promise<AuthPayload> => {
        const authCtx = ctx as AuthContext;
        const knex = this.getKnex(ctx);
        const { authService } = this.createRepositories(knex);

        try {
            return await authService.refreshAccessToken(
                args.refreshToken,
                authCtx.ipAddress
            );
        } catch (error) {
            if (error instanceof AuthServiceError) {
                throw new Error(error.message);
            }
            throw error;
        }
    };

    revokeAllSessions = async (_root: unknown, _args: unknown, ctx: IContext) => {
        const authCtx = ctx as AuthContext;
        const user = this.requireAuth(authCtx);
        const knex = this.getKnex(ctx);
        const { authService } = this.createRepositories(knex);

        await authService.revokeAllUserTokens(user.id);
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
        const currentUser = await this.requireAdmin(authCtx, repos.authService);

        const result = await repos.authService.register(
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
        const currentUser = await this.requireAdmin(authCtx, repos.authService);

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
        const currentUser = await this.requireAdmin(authCtx, repos.authService);

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
        const currentUser = await this.requireAdmin(authCtx, repos.authService);

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
        const currentUser = await this.requireAdmin(authCtx, repos.authService);

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
        const currentUser = await this.requireAdmin(authCtx, repos.authService);

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
