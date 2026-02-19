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
  const state = licenseService.getLicenseState();

  if (state.isLicensed) {
    // Set license status cookie — 24h expiry
    res.setHeader(
      'Set-Cookie',
      `nqrust_license_status=valid; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
    );
    return res.status(200).json({ licensed: true, status: state.status });
  }

  // Clear the cookie if unlicensed
  res.setHeader(
    'Set-Cookie',
    `nqrust_license_status=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
  return res.status(200).json({ licensed: false, status: state.status });
}
