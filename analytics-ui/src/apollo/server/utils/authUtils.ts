import bcrypt from 'bcryptjs';
import { UserRepository, User } from '../repositories/userRepository';
import { RoleRepository } from '../repositories/roleRepository';
import { AuditLogRepository, AuditActions } from '../repositories/auditLogRepository';

const SALT_ROUNDS = 12;

export class AuthServiceError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'AuthServiceError';
    }
}

export interface RegisterInput {
    email: string;
    password: string;
    displayName: string;
}

interface RegisterRepos {
    userRepository: UserRepository;
    roleRepository: RoleRepository;
    auditLogRepository: AuditLogRepository;
}

interface ChangePasswordRepos {
    userRepository: UserRepository;
    auditLogRepository: AuditLogRepository;
}

export class AuthUtils {
    static validatePassword(password: string): { valid: boolean; message?: string } {
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters long' };
        }
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }
        if (!/[0-9]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }
        return { valid: true };
    }

    static async register(repos: RegisterRepos, input: RegisterInput, ipAddress?: string) {
        const { email, password, displayName } = input;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new AuthServiceError('Invalid email format', 'INVALID_EMAIL');
        }

        const validation = AuthUtils.validatePassword(password);
        if (!validation.valid) {
            throw new AuthServiceError(validation.message!, 'WEAK_PASSWORD');
        }

        const existing = await repos.userRepository.findByEmail(email);
        if (existing) {
            throw new AuthServiceError('A user with this email already exists', 'EMAIL_EXISTS');
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await repos.userRepository.createOne({
            email: email.toLowerCase(),
            passwordHash,
            displayName,
            isActive: true,
            isVerified: false,
        });

        const viewerRole = await repos.roleRepository.findByName('viewer');
        if (viewerRole) {
            await repos.userRepository.assignRole(user.id, viewerRole.id);
        }

        const userWithRoles = await repos.userRepository.findByIdWithRoles(user.id);

        await repos.auditLogRepository.log({
            userId: user.id,
            action: AuditActions.REGISTER,
            resourceType: 'user',
            resourceId: user.id.toString(),
            ipAddress,
        });

        return { user: userWithRoles! };
    }

    static async changePassword(
        repos: ChangePasswordRepos,
        userId: number,
        oldPassword: string,
        newPassword: string,
        ipAddress?: string
    ): Promise<void> {
        const user = await repos.userRepository.findOneBy({ id: userId } as Partial<User>);
        if (!user) {
            throw new AuthServiceError('User not found', 'USER_NOT_FOUND');
        }

        const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isValid) {
            throw new AuthServiceError('Current password is incorrect', 'INVALID_PASSWORD');
        }

        const validation = AuthUtils.validatePassword(newPassword);
        if (!validation.valid) {
            throw new AuthServiceError(validation.message!, 'WEAK_PASSWORD');
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await repos.userRepository.updateOne(userId, { passwordHash } as Partial<User>);

        await repos.auditLogRepository.log({
            userId,
            action: AuditActions.PASSWORD_CHANGE,
            resourceType: 'user',
            resourceId: userId.toString(),
            ipAddress,
        });
    }

    static async requestPasswordReset(
        repos: ChangePasswordRepos,
        email: string,
        ipAddress?: string
    ): Promise<null> {
        const user = await repos.userRepository.findByEmail(email.toLowerCase());
        if (user) {
            await repos.auditLogRepository.log({
                userId: user.id,
                action: AuditActions.PASSWORD_RESET_REQUEST,
                resourceType: 'user',
                resourceId: user.id.toString(),
                ipAddress,
            });
        }
        // Never reveal whether the email exists
        return null;
    }
}
