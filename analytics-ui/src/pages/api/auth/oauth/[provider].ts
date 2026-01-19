import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { OAuthService, OAuthProvider } from '@/apollo/server/services/oauthService';
import { initComponents } from '@/common';

const { knex } = initComponents();

// State management for OAuth (in production, use Redis or database)
const oauthStates = new Map<string, { provider: string; redirect: string; expiresAt: number }>();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { provider, action } = req.query;
    const providerName = provider as OAuthProvider;

    const oauthService = new OAuthService(knex);

    // Check if provider is enabled
    if (!oauthService.isProviderEnabled(providerName)) {
        return res.status(400).json({ error: `OAuth provider '${providerName}' is not configured` });
    }

    const baseUrl = process.env.APP_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    const redirectUri = `${baseUrl}/api/auth/oauth/${providerName}/callback`;

    // Handle different actions
    if (action === 'callback' || req.query.code) {
        // Handle OAuth callback
        return handleCallback(req, res, oauthService, providerName, redirectUri);
    } else {
        // Initiate OAuth flow
        return handleInitiate(req, res, oauthService, providerName, redirectUri);
    }
}

async function handleInitiate(
    req: NextApiRequest,
    res: NextApiResponse,
    oauthService: OAuthService,
    provider: OAuthProvider,
    redirectUri: string
) {
    try {
        // Generate state for CSRF protection
        const state = crypto.randomBytes(16).toString('hex');
        const redirect = (req.query.redirect as string) || '/home';

        // Store state (expires in 10 minutes)
        oauthStates.set(state, {
            provider,
            redirect,
            expiresAt: Date.now() + 10 * 60 * 1000,
        });

        // Clean up old states
        for (const [key, value] of oauthStates.entries()) {
            if (value.expiresAt < Date.now()) {
                oauthStates.delete(key);
            }
        }

        // Get authorization URL
        const authUrl = oauthService.getAuthorizationUrl(provider, redirectUri, state);

        // Redirect to OAuth provider
        res.redirect(authUrl);
    } catch (error: any) {
        console.error('OAuth initiate error:', error);
        res.redirect(`/login?error=${encodeURIComponent(error.message || 'OAuth failed')}`);
    }
}

async function handleCallback(
    req: NextApiRequest,
    res: NextApiResponse,
    oauthService: OAuthService,
    provider: OAuthProvider,
    redirectUri: string
) {
    try {
        const { code, state, error, error_description } = req.query;

        // Check for OAuth error
        if (error) {
            throw new Error(error_description as string || error as string);
        }

        // Validate state
        if (!state || typeof state !== 'string') {
            throw new Error('Invalid state parameter');
        }

        const storedState = oauthStates.get(state);
        if (!storedState || storedState.expiresAt < Date.now()) {
            oauthStates.delete(state);
            throw new Error('State expired or invalid');
        }

        // Clean up used state
        oauthStates.delete(state);

        if (!code || typeof code !== 'string') {
            throw new Error('No authorization code received');
        }

        // Get client IP
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
            || req.socket.remoteAddress
            || 'unknown';

        // Handle OAuth callback (login or register)
        const authPayload = await oauthService.handleOAuthCallback(
            provider,
            code,
            redirectUri.replace('/callback', ''), // Remove /callback for proper redirect_uri
            ipAddress
        );

        // Set tokens in cookies
        res.setHeader('Set-Cookie', [
            `nqrust_access_token=${authPayload.accessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`,
            `nqrust_refresh_token=${authPayload.refreshToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
        ]);

        // Redirect to the intended destination
        res.redirect(storedState.redirect);
    } catch (error: any) {
        console.error('OAuth callback error:', error);
        res.redirect(`/login?error=${encodeURIComponent(error.message || 'OAuth authentication failed')}`);
    }
}
