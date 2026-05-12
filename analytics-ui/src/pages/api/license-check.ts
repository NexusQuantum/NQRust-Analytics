import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { licenseService } = components;
  let state = licenseService.getLicenseState();

  // A new browser/client may hit this endpoint before the in-memory license
  // cache has been hydrated. Confirm against the installation-level license
  // state before reporting the app as unlicensed.
  if (state.lastCheckResult === null) {
    state = await licenseService.checkLicense();
  }

  // Three-state shape (mirrors portal): expose lastCheckResult so callers
  // can distinguish "definitively invalid" from "server unreachable" and
  // avoid redirecting on transient outages.
  return res.status(200).json({
    licensed: state.isLicensed,
    status: state.status,
    lastCheckResult: state.lastCheckResult,
    isGracePeriod: state.isGracePeriod,
    graceDaysRemaining: state.graceDaysRemaining,
  });
}
