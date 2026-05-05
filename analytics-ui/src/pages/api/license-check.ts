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
  if (!state.isLicensed) {
    state = await licenseService.checkLicense();
  }

  if (state.isLicensed) {
    return res.status(200).json({ licensed: true, status: state.status });
  }

  return res.status(200).json({ licensed: false, status: state.status });
}
