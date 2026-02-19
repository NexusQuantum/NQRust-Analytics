import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { IConfig } from '@server/config';
import {
  LicenseRepository,
  LicenseRecord,
  LicenseStatus,
} from '@server/repositories/licenseRepository';
import { getLogger } from '@server/utils';

const logger = getLogger('LICENSE');
logger.level = 'debug';

export interface LicensePayload {
  licenseId: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  features: string[];
  maxActivations?: number;
  issuedAt: string;
  expiresAt: string;
}

export interface LicenseVerifyResponse {
  valid: boolean;
  license?: {
    key: string;
    status: string;
    product: string;
    productId: string;
    customer: string;
    customerId: string;
    features?: string[];
    createdAt: string;
    expiresAt: string;
  };
  activations?: number;
  maxActivations?: number;
  error?: string;
  message?: string;
}

export interface LicenseState {
  isLicensed: boolean;
  status: LicenseStatus;
  isGracePeriod: boolean;
  graceDaysRemaining: number | null;
  customerName: string | null;
  product: string | null;
  features: string[];
  expiresAt: string | null;
  activations: number | null;
  maxActivations: number | null;
  verifiedAt: string | null;
  licenseKey: string | null;
  errorMessage: string | null;
}

export interface ILicenseService {
  checkLicense(): Promise<LicenseState>;
  activateLicenseKey(licenseKey: string): Promise<LicenseState>;
  activateOfflineFile(filePath: string): Promise<LicenseState>;
  getLicenseState(): LicenseState;
  getFeatures(): string[];
}

const UNLICENSED_STATE: LicenseState = {
  isLicensed: false,
  status: 'unlicensed',
  isGracePeriod: false,
  graceDaysRemaining: null,
  customerName: null,
  product: null,
  features: [],
  expiresAt: null,
  activations: null,
  maxActivations: null,
  verifiedAt: null,
  licenseKey: null,
  errorMessage: null,
};

const RE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class LicenseService implements ILicenseService {
  private config: IConfig;
  private licenseRepository: LicenseRepository;
  private deviceId: string;
  private cachedState: LicenseState = { ...UNLICENSED_STATE };
  private lastCheckTime: number = 0;
  private checkInProgress: boolean = false;

  constructor(config: IConfig, licenseRepository: LicenseRepository) {
    this.config = config;
    this.licenseRepository = licenseRepository;
    this.deviceId = this.getOrGenerateDeviceId();
    this.loadPersistedLicenseKey();
  }

  /**
   * On startup, check if a license key was previously activated via the UI
   * and persisted to disk. This takes priority over the env var since the user
   * may have activated a different key through the Settings UI.
   */
  private loadPersistedLicenseKey(): void {
    const dataDir =
      this.config.persistCredentialDir || path.join(process.cwd(), '.tmp');
    const keyFile = path.join(dataDir, '.license-key');

    try {
      const persisted = fs.readFileSync(keyFile, 'utf-8').trim();
      if (persisted) {
        logger.info('Loaded persisted license key from disk (UI-activated)');
        this.config.licenseKey = persisted;
      }
    } catch {
      // no persisted key — use env var as-is
    }
  }

  private persistLicenseKey(key: string): void {
    const dataDir =
      this.config.persistCredentialDir || path.join(process.cwd(), '.tmp');
    const keyFile = path.join(dataDir, '.license-key');

    try {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      fs.writeFileSync(keyFile, key, 'utf-8');
      logger.info('Persisted license key to disk');
    } catch (err) {
      logger.warn('Failed to persist license key:', err);
    }
  }

  private getOrGenerateDeviceId(): string {
    const dataDir =
      this.config.persistCredentialDir || path.join(process.cwd(), '.tmp');
    const idFile = path.join(dataDir, '.device-id');

    try {
      const existing = fs.readFileSync(idFile, 'utf-8').trim();
      if (existing) return existing;
    } catch {
      // file doesn't exist, generate new
    }

    const info = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model || '',
    ].join('|');
    const id = crypto
      .createHash('sha256')
      .update(info)
      .digest('hex')
      .slice(0, 32);

    try {
      fs.mkdirSync(path.dirname(idFile), { recursive: true });
      fs.writeFileSync(idFile, id);
    } catch (err) {
      logger.warn('Failed to persist device ID:', err);
    }

    return id;
  }

  private async verifyOnline(
    licenseKey: string,
  ): Promise<LicenseVerifyResponse> {
    const url = `${this.config.licenseServerUrl}/api/v1/licenses/verify`;
    const apiKey = this.config.licenseApiKey;

    if (!apiKey) {
      throw new Error('LICENSE_API_KEY is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          licenseKey,
          deviceId: this.deviceId,
          deviceName: 'NQRust Analytics',
        }),
        signal: controller.signal,
      });

      return (await res.json()) as LicenseVerifyResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private verifyOfflineFile(filePath: string): {
    valid: boolean;
    expired: boolean;
    payload: LicensePayload | null;
    error?: string;
  } {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      const payloadMatch = content.match(
        /-----BEGIN LICENSE-----\n([\s\S]+?)\n-----END LICENSE-----/,
      );
      const sigMatch = content.match(
        /-----BEGIN SIGNATURE-----\n([\s\S]+?)\n-----END SIGNATURE-----/,
      );

      if (!payloadMatch || !sigMatch) {
        return {
          valid: false,
          expired: false,
          payload: null,
          error: 'Invalid license file format',
        };
      }

      const payloadJson = Buffer.from(
        payloadMatch[1].trim(),
        'base64',
      ).toString('utf-8');
      const payload: LicensePayload = JSON.parse(payloadJson);

      const publicKeyPem = this.config.licensePublicKey;
      if (!publicKeyPem) {
        return {
          valid: false,
          expired: false,
          payload: null,
          error: 'LICENSE_PUBLIC_KEY not configured — cannot verify offline license',
        };
      }

      const signatureValid = crypto.verify(
        null,
        Buffer.from(payloadJson),
        publicKeyPem,
        Buffer.from(sigMatch[1].trim(), 'base64'),
      );

      if (!signatureValid) {
        return {
          valid: false,
          expired: false,
          payload: null,
          error: 'Invalid signature — license may be tampered',
        };
      }

      const now = new Date().toISOString().split('T')[0];
      const expired = payload.expiresAt < now;

      return { valid: true, expired, payload };
    } catch (err) {
      return {
        valid: false,
        expired: false,
        payload: null,
        error: `Failed to read or parse license file: ${err}`,
      };
    }
  }

  private async loadCachedState(): Promise<LicenseState | null> {
    try {
      const record = await this.licenseRepository.getLatest();
      if (!record) return null;

      const features = record.features || [];
      const gracePeriodDays = this.config.licenseGracePeriodDays || 7;

      let isGracePeriod = false;
      let graceDaysRemaining: number | null = null;

      if (record.verifiedAt && record.status !== 'invalid') {
        const verifiedDate = new Date(record.verifiedAt);
        const now = new Date();
        const daysSinceVerification = Math.floor(
          (now.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysSinceVerification <= gracePeriodDays) {
          isGracePeriod = true;
          graceDaysRemaining = gracePeriodDays - daysSinceVerification;
        }
      }

      return {
        isLicensed: record.status === 'active' || isGracePeriod,
        status: isGracePeriod && record.status !== 'active'
          ? 'grace_period'
          : record.status,
        isGracePeriod,
        graceDaysRemaining,
        customerName: record.customerName,
        product: record.product,
        features,
        expiresAt: record.expiresAt,
        activations: record.activations,
        maxActivations: record.maxActivations,
        verifiedAt: record.verifiedAt,
        licenseKey: record.licenseKey
          ? record.licenseKey.slice(0, 4) + '-****-****-' + record.licenseKey.slice(-4)
          : null,
        errorMessage: null,
      };
    } catch (err) {
      logger.warn('Failed to load cached license state:', err);
      return null;
    }
  }

  private async saveLicenseState(
    licenseKey: string,
    response: LicenseVerifyResponse,
    isOffline: boolean,
  ): Promise<void> {
    try {
      const data: Partial<LicenseRecord> = {
        licenseKey,
        status: response.valid ? 'active' : 'invalid',
        customerName: response.license?.customer || null,
        product: response.license?.product || null,
        productId: response.license?.productId || null,
        customerId: response.license?.customerId || null,
        features: response.license?.features || null,
        expiresAt: response.license?.expiresAt || null,
        verifiedAt: new Date().toISOString(),
        activations: response.activations || null,
        maxActivations: response.maxActivations || null,
        cachedResponse: JSON.stringify(response),
        deviceId: this.deviceId,
        isOffline,
      };

      // Check for expired status
      if (response.valid && response.license?.expiresAt) {
        const now = new Date().toISOString().split('T')[0];
        if (response.license.expiresAt < now) {
          data.status = 'expired';
        }
      }

      if (!response.valid && response.error === 'license_expired') {
        data.status = 'expired';
      }

      await this.licenseRepository.upsert(data);
    } catch (err) {
      logger.warn('Failed to save license state:', err);
    }
  }

  private buildStateFromOnlineResponse(
    licenseKey: string,
    response: LicenseVerifyResponse,
  ): LicenseState {
    if (response.valid) {
      return {
        isLicensed: true,
        status: 'active',
        isGracePeriod: false,
        graceDaysRemaining: null,
        customerName: response.license?.customer || null,
        product: response.license?.product || null,
        features: response.license?.features || [],
        expiresAt: response.license?.expiresAt || null,
        activations: response.activations || null,
        maxActivations: response.maxActivations || null,
        verifiedAt: new Date().toISOString(),
        licenseKey: licenseKey.slice(0, 4) + '-****-****-' + licenseKey.slice(-4),
        errorMessage: null,
      };
    }

    return {
      isLicensed: false,
      status: response.error === 'license_expired' ? 'expired' : 'invalid',
      isGracePeriod: false,
      graceDaysRemaining: null,
      customerName: null,
      product: null,
      features: [],
      expiresAt: null,
      activations: response.activations || null,
      maxActivations: response.maxActivations || null,
      verifiedAt: null,
      licenseKey: licenseKey.slice(0, 4) + '-****-****-' + licenseKey.slice(-4),
      errorMessage: response.message || response.error || 'License verification failed',
    };
  }

  private buildStateFromOfflinePayload(
    payload: LicensePayload,
    expired: boolean,
  ): LicenseState {
    return {
      isLicensed: !expired,
      status: expired ? 'expired' : 'active',
      isGracePeriod: false,
      graceDaysRemaining: null,
      customerName: payload.customerName,
      product: payload.productName,
      features: payload.features || [],
      expiresAt: payload.expiresAt,
      activations: null,
      maxActivations: payload.maxActivations || null,
      verifiedAt: new Date().toISOString(),
      licenseKey: payload.licenseId
        ? payload.licenseId.slice(0, 4) + '-****-****-' + payload.licenseId.slice(-4)
        : null,
      errorMessage: expired ? 'License has expired' : null,
    };
  }

  public async checkLicense(): Promise<LicenseState> {
    const licenseKey = this.config.licenseKey;

    if (!licenseKey) {
      logger.info('No LICENSE_KEY configured — running in unlicensed mode');
      this.cachedState = { ...UNLICENSED_STATE };
      this.lastCheckTime = Date.now();
      return this.cachedState;
    }

    // Try 1: Online verification
    try {
      logger.info('Verifying license online...');
      const response = await this.verifyOnline(licenseKey);
      const state = this.buildStateFromOnlineResponse(licenseKey, response);
      await this.saveLicenseState(licenseKey, response, false);
      this.cachedState = state;
      this.lastCheckTime = Date.now();

      if (state.isLicensed) {
        logger.info(
          `License verified: ${state.product} for ${state.customerName} (expires ${state.expiresAt})`,
        );
      } else {
        logger.warn(`License invalid: ${state.errorMessage}`);
      }

      return state;
    } catch (networkError) {
      logger.warn(
        'Online verification failed, trying fallbacks:',
        networkError instanceof Error ? networkError.message : networkError,
      );
    }

    // Try 2: Offline .lic file
    if (this.config.licenseFilePath) {
      try {
        logger.info(
          `Trying offline verification: ${this.config.licenseFilePath}`,
        );
        const result = this.verifyOfflineFile(this.config.licenseFilePath);
        if (result.valid && result.payload) {
          const state = this.buildStateFromOfflinePayload(
            result.payload,
            result.expired,
          );

          // Save as offline verification
          await this.saveLicenseState(
            result.payload.licenseId,
            {
              valid: !result.expired,
              license: {
                key: result.payload.licenseId,
                status: result.expired ? 'expired' : 'active',
                product: result.payload.productName,
                productId: result.payload.productId,
                customer: result.payload.customerName,
                customerId: result.payload.customerId,
                features: result.payload.features,
                createdAt: result.payload.issuedAt,
                expiresAt: result.payload.expiresAt,
              },
              error: result.expired ? 'license_expired' : undefined,
            },
            true,
          );

          this.cachedState = state;
          this.lastCheckTime = Date.now();

          if (state.isLicensed) {
            logger.info(
              `Offline license verified: ${state.product} (expires ${state.expiresAt})`,
            );
          }

          return state;
        } else {
          logger.warn(`Offline verification failed: ${result.error}`);
        }
      } catch (err) {
        logger.warn('Offline license file error:', err);
      }
    }

    // Try 3: Cached DB result with grace period
    const cached = await this.loadCachedState();
    if (cached) {
      if (cached.isLicensed) {
        logger.info(
          `Using cached license (grace period: ${cached.graceDaysRemaining} days remaining)`,
        );
        this.cachedState = cached;
        this.lastCheckTime = Date.now();
        return cached;
      }
      // Cached but no longer in grace period
      logger.warn('Cached license expired beyond grace period');
      this.cachedState = {
        ...cached,
        isLicensed: false,
        isGracePeriod: false,
        errorMessage: 'License server unreachable and grace period expired',
      };
      this.lastCheckTime = Date.now();
      return this.cachedState;
    }

    // All fallbacks failed
    logger.warn('All license verification methods failed — unlicensed');
    this.cachedState = {
      ...UNLICENSED_STATE,
      licenseKey: licenseKey.slice(0, 4) + '-****-****-' + licenseKey.slice(-4),
      errorMessage:
        'License verification failed — server unreachable and no cached verification',
    };
    this.lastCheckTime = Date.now();
    return this.cachedState;
  }

  public async activateLicenseKey(licenseKey: string): Promise<LicenseState> {
    // Temporarily use this key for verification
    const originalKey = this.config.licenseKey;
    this.config.licenseKey = licenseKey;

    try {
      const state = await this.checkLicense();

      if (!state.isLicensed) {
        // Revert key on failure
        this.config.licenseKey = originalKey;
      } else {
        // Persist the new key so it survives container restarts
        this.persistLicenseKey(licenseKey);
      }

      return state;
    } catch (err) {
      this.config.licenseKey = originalKey;
      throw err;
    }
  }

  public async activateOfflineFile(filePath: string): Promise<LicenseState> {
    logger.info(`Activating offline license from uploaded file: ${filePath}`);
    const result = this.verifyOfflineFile(filePath);

    if (!result.valid || !result.payload) {
      const errorMsg = result.error || 'Invalid license file';
      logger.warn(`Offline activation failed: ${errorMsg}`);
      return {
        ...UNLICENSED_STATE,
        errorMessage: errorMsg,
      };
    }

    const state = this.buildStateFromOfflinePayload(
      result.payload,
      result.expired,
    );

    await this.saveLicenseState(
      result.payload.licenseId,
      {
        valid: !result.expired,
        license: {
          key: result.payload.licenseId,
          status: result.expired ? 'expired' : 'active',
          product: result.payload.productName,
          productId: result.payload.productId,
          customer: result.payload.customerName,
          customerId: result.payload.customerId,
          features: result.payload.features,
          createdAt: result.payload.issuedAt,
          expiresAt: result.payload.expiresAt,
        },
        error: result.expired ? 'license_expired' : undefined,
      },
      true,
    );

    // Persist the file path for future re-checks
    this.config.licenseFilePath = filePath;
    this.cachedState = state;
    this.lastCheckTime = Date.now();

    if (state.isLicensed) {
      logger.info(
        `Offline license activated: ${state.product} (expires ${state.expiresAt})`,
      );
    }

    return state;
  }

  public getLicenseState(): LicenseState {
    // Trigger lazy re-check if stale (with guard to prevent concurrent checks)
    if (
      this.config.licenseKey &&
      !this.checkInProgress &&
      Date.now() - this.lastCheckTime > RE_CHECK_INTERVAL_MS
    ) {
      this.checkInProgress = true;
      this.checkLicense()
        .catch((err) =>
          logger.warn('Background license re-check failed:', err),
        )
        .finally(() => {
          this.checkInProgress = false;
        });
    }

    return this.cachedState;
  }

  public getFeatures(): string[] {
    return this.cachedState?.features || [];
  }
}
