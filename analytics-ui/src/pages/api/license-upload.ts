import fs from 'node:fs';
import path from 'node:path';
import { NextApiRequest, NextApiResponse } from 'next';
import { components, serverConfig } from '@/common';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { content } = req.body;
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing license file content' });
  }

  // Basic format check
  if (
    !content.includes('-----BEGIN LICENSE-----') ||
    !content.includes('-----BEGIN SIGNATURE-----')
  ) {
    return res.status(400).json({ error: 'Invalid .lic file format' });
  }

  try {
    // Save to persistent data directory
    const dataDir =
      serverConfig.persistCredentialDir || path.join(process.cwd(), '.tmp');
    fs.mkdirSync(dataDir, { recursive: true });

    const licFilePath = path.join(dataDir, 'license.lic');
    fs.writeFileSync(licFilePath, content, 'utf-8');

    // Activate via license service
    const { licenseService } = components;
    const state = await licenseService.activateOfflineFile(licFilePath);

    // Set/clear license cookie
    if (state.isLicensed) {
      res.setHeader(
        'Set-Cookie',
        `nqrust_license_status=valid; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      );
    }

    return res.status(200).json(state);
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || 'Failed to process license file' });
  }
}
