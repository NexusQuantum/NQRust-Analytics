import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';

export enum ThreadSharePermission {
    VIEW = 'view',
    EDIT = 'edit',
}

export interface ThreadShare {
    id: number;
    threadId: number;
    userId: number;
    permission: ThreadSharePermission;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ThreadShareWithUser extends ThreadShare {
    userEmail: string;
    userDisplayName: string;
}

export interface IThreadShareRepository extends IBasicRepository<ThreadShare> {
    findByThreadId(threadId: number): Promise<ThreadShareWithUser[]>;
    findByUserId(userId: number): Promise<ThreadShare[]>;
    findByThreadAndUser(
        threadId: number,
        userId: number,
    ): Promise<ThreadShare | null>;
    deleteByThreadAndUser(threadId: number, userId: number): Promise<boolean>;
}

export class ThreadShareRepository
    extends BaseRepository<ThreadShare>
    implements IThreadShareRepository {
    constructor(knexPg: Knex) {
        super({ knexPg, tableName: 'thread_share' });
    }

    public async findByThreadId(threadId: number): Promise<ThreadShareWithUser[]> {
        const shares = await this.knex('thread_share')
            .select(
                'thread_share.*',
                'user.email as user_email',
                'user.display_name as user_display_name',
            )
            .join('user', 'thread_share.user_id', 'user.id')
            .where('thread_share.thread_id', threadId);

        return shares.map((share) => ({
            id: share.id,
            threadId: share.thread_id,
            userId: share.user_id,
            permission: share.permission as ThreadSharePermission,
            createdAt: share.created_at,
            updatedAt: share.updated_at,
            userEmail: share.user_email,
            userDisplayName: share.user_display_name,
        }));
    }

    public async findByUserId(userId: number): Promise<ThreadShare[]> {
        return this.findAllBy({ userId });
    }

    public async findByThreadAndUser(
        threadId: number,
        userId: number,
    ): Promise<ThreadShare | null> {
        return this.findOneBy({ threadId, userId });
    }

    public async deleteByThreadAndUser(
        threadId: number,
        userId: number,
    ): Promise<boolean> {
        const result = await this.knex('thread_share')
            .where({ thread_id: threadId, user_id: userId })
            .delete();
        return result > 0;
    }
}
