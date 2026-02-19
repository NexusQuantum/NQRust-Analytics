import { Knex } from 'knex';
import { BaseRepository, IBasicRepository } from './baseRepository';
import {
  camelCase,
  isPlainObject,
  mapKeys,
  mapValues,
  snakeCase,
} from 'lodash';

export type LicenseStatus =
  | 'active'
  | 'expired'
  | 'invalid'
  | 'grace_period'
  | 'unlicensed'
  | 'unknown';

export interface LicenseRecord {
  id: number;
  licenseKey: string;
  status: LicenseStatus;
  customerName: string | null;
  product: string | null;
  productId: string | null;
  customerId: string | null;
  features: string[] | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  activations: number | null;
  maxActivations: number | null;
  cachedResponse: string | null;
  deviceId: string | null;
  isOffline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ILicenseRepository extends IBasicRepository<LicenseRecord> {
  getLatest(): Promise<LicenseRecord | null>;
  upsert(data: Partial<LicenseRecord>): Promise<LicenseRecord>;
}

export class LicenseRepository
  extends BaseRepository<LicenseRecord>
  implements ILicenseRepository
{
  constructor(knexPg: Knex) {
    super({ knexPg, tableName: 'license' });
  }

  public async getLatest(): Promise<LicenseRecord | null> {
    const result = await this.knex(this.tableName)
      .orderBy('updated_at', 'desc')
      .limit(1);
    return result && result.length > 0
      ? this.transformFromDBData(result[0])
      : null;
  }

  public async upsert(data: Partial<LicenseRecord>): Promise<LicenseRecord> {
    const existing = await this.getLatest();
    if (existing) {
      return this.updateOne(existing.id, data);
    }
    return this.createOne(data);
  }

  protected override transformToDBData = (data: any) => {
    if (!isPlainObject(data)) {
      throw new Error('Unexpected dbdata');
    }
    const transformedData = mapValues(data, (value, key) => {
      if (['features'].includes(key)) {
        return value ? JSON.stringify(value) : null;
      }
      return value;
    });
    return mapKeys(transformedData, (_value, key) => snakeCase(key));
  };

  protected override transformFromDBData = (data: any): LicenseRecord => {
    if (!isPlainObject(data)) {
      throw new Error('Unexpected dbdata');
    }
    const camelCaseData = mapKeys(data, (_value, key) => camelCase(key));
    const formattedData = mapValues(camelCaseData, (value, key) => {
      if (['features'].includes(key)) {
        if (typeof value === 'string') {
          return value ? JSON.parse(value) : value;
        }
        return value;
      }
      return value;
    }) as LicenseRecord;
    return formattedData;
  };
}
