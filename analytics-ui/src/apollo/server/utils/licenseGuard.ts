import { NextApiResponse } from 'next';
import { components } from '@/common';

export function requireLicense(res: NextApiResponse): boolean {
  const { licenseService } = components;
  const state = licenseService.getLicenseState();

  if (!state.isLicensed) {
    res.status(403).json({
      error: 'license_required',
      message: 'A valid license is required to use this API',
      status: state.status,
    });
    return false;
  }
  return true;
}
