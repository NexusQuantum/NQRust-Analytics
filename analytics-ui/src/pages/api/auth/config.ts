import type { NextApiRequest, NextApiResponse } from 'next';
import { getConfig } from '@/apollo/server/config';

export interface AuthConfigResponse {
  providers: {
    google: boolean;
    github: boolean;
  };
  keycloakEnabled: boolean;
}

/**
 * API endpoint to get authentication configuration.
 * Returns which OAuth providers are enabled.
 * Keycloak is configured via KEYCLOAK_* environment variables.
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
    keycloakEnabled: process.env.KEYCLOAK_OAUTH_ENABLED === 'true' &&
      !!(process.env.KEYCLOAK_CLIENT_ID && process.env.KEYCLOAK_CLIENT_SECRET),
  });
}
