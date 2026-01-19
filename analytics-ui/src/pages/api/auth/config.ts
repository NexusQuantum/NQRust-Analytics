import type { NextApiRequest, NextApiResponse } from 'next';
import { getConfig } from '@/apollo/server/config';

export interface AuthConfigResponse {
  providers: {
    google: boolean;
    github: boolean;
  };
}

/**
 * API endpoint to get authentication configuration
 * Returns which OAuth providers are enabled for the frontend to conditionally render login buttons
 */
export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse<AuthConfigResponse>
) {
  const config = getConfig();

  res.status(200).json({
    providers: {
      google: config.googleOAuthEnabled ?? false,
      github: config.githubOAuthEnabled ?? false,
    },
  });
}
