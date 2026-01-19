import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';
import {
  camelCase,
  isPlainObject,
  mapKeys,
  mapValues,
  snakeCase,
} from 'lodash';

export interface ThreadRecommendationQuestionResult {
  question: string;
  category: string;
  sql: string;
}

export interface Thread {
  id: number; // ID
  projectId: number; // Reference to project.id
  userId?: number; // Reference to user.id - owner of the thread
  summary: string; // Thread summary

  // recommend question
  queryId?: string; // Query ID
  questions?: ThreadRecommendationQuestionResult[]; // Recommended questions
  questionsStatus?: string; // Status of the recommended questions
  questionsError?: object; // Error of the recommended questions
}

export interface ThreadWithCreator extends Thread {
  creatorEmail?: string;
  creatorDisplayName?: string;
}

export interface IThreadRepository extends IBasicRepository<Thread> {
  listAllTimeDescOrder(projectId: number): Promise<Thread[]>;
  /**
   * Find all threads accessible by a user:
   * - Threads created by the user
   * - Threads shared with the user
   */
  findAccessibleByUser(
    projectId: number,
    userId: number,
  ): Promise<ThreadWithCreator[]>;
  /**
   * Check if a user has access to a thread (owner or shared)
   */
  hasAccess(threadId: number, userId: number): Promise<boolean>;
}

export class ThreadRepository
  extends BaseRepository<Thread>
  implements IThreadRepository
{
  private readonly jsonbColumns = ['questions', 'questionsError'];

  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'thread' });
  }

  public async listAllTimeDescOrder(projectId: number): Promise<Thread[]> {
    const threads = await this.knex(this.tableName)
      .where(this.transformToDBData({ projectId }))
      .orderBy('created_at', 'desc');
    return threads.map((thread) => this.transformFromDBData(thread));
  }

  /**
   * Find all threads accessible by a user:
   * - Threads created by the user
   * - Threads shared with the user
   */
  public async findAccessibleByUser(
    projectId: number,
    userId: number,
  ): Promise<ThreadWithCreator[]> {
    const results = await this.knex('thread')
      .select(
        'thread.*',
        'creator.email as creator_email',
        'creator.display_name as creator_display_name',
      )
      .leftJoin('user as creator', 'thread.user_id', 'creator.id')
      .leftJoin('thread_share', 'thread.id', 'thread_share.thread_id')
      .where('thread.project_id', projectId)
      .andWhere(function () {
        this.where('thread.user_id', userId).orWhere(
          'thread_share.user_id',
          userId,
        );
      })
      .groupBy('thread.id', 'creator.email', 'creator.display_name')
      .orderBy('thread.created_at', 'desc');

    return results.map((row) => this.transformFromDBDataWithCreator(row));
  }

  /**
   * Check if a user has access to a thread (owner or shared)
   */
  public async hasAccess(threadId: number, userId: number): Promise<boolean> {
    const result = await this.knex('thread')
      .leftJoin('thread_share', 'thread.id', 'thread_share.thread_id')
      .where('thread.id', threadId)
      .andWhere(function () {
        this.where('thread.user_id', userId).orWhere(
          'thread_share.user_id',
          userId,
        );
      })
      .first();

    return !!result;
  }

  protected transformFromDBDataWithCreator = (data: any): ThreadWithCreator => {
    const thread = this.transformFromDBData(data);
    return {
      ...thread,
      creatorEmail: data.creator_email,
      creatorDisplayName: data.creator_display_name,
    };
  };

  protected override transformFromDBData = (data: any): Thread => {
    if (!isPlainObject(data)) {
      throw new Error('Unexpected dbdata');
    }
    const camelCaseData = mapKeys(data, (_value, key) => camelCase(key));
    const transformData = mapValues(camelCaseData, (value, key) => {
      if (this.jsonbColumns.includes(key)) {
        if (typeof value === 'string') {
          return value ? JSON.parse(value) : value;
        } else {
          return value;
        }
      }
      return value;
    });
    return transformData as Thread;
  };

  protected override transformToDBData = (data: any) => {
    if (!isPlainObject(data)) {
      throw new Error('Unexpected dbdata');
    }
    const transformedData = mapValues(data, (value, key) => {
      if (this.jsonbColumns.includes(key)) {
        return JSON.stringify(value);
      } else {
        return value;
      }
    });
    return mapKeys(transformedData, (_value, key) => snakeCase(key));
  };
}
