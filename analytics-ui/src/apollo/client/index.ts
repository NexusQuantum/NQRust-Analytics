import { ApolloClient, HttpLink, InMemoryCache, from, Observable } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import errorHandler from '@/utils/errorHandler';

const ACCESS_TOKEN_KEY = 'nqrust_access_token';
const REFRESH_TOKEN_KEY = 'nqrust_refresh_token';

// Track in-flight refresh to prevent concurrent refresh storms
let isRefreshing = false;

// Queue holds both the retry callback and observer so we can error out on failure
interface PendingRequest {
  resolve: () => void;
  reject: (err: Error) => void;
}
let pendingRequests: PendingRequest[] = [];

// Listeners notified when tokens are refreshed (so React state can sync)
type TokenRefreshListener = (accessToken: string) => void;
const tokenRefreshListeners = new Set<TokenRefreshListener>();
export const onTokenRefresh = (listener: TokenRefreshListener) => {
  tokenRefreshListeners.add(listener);
  return () => tokenRefreshListeners.delete(listener);
};

const resolvePendingRequests = () => {
  pendingRequests.forEach((req) => req.resolve());
  pendingRequests = [];
};

const rejectPendingRequests = (err: Error) => {
  pendingRequests.forEach((req) => req.reject(err));
  pendingRequests = [];
};

const forceLogout = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.location.href = '/login';
};

const apolloErrorLink = onError(
  ({ graphQLErrors, networkError, operation, forward }) => {
    const hasAuthError = graphQLErrors?.some(
      (err) => err.extensions?.code === 'UNAUTHENTICATED'
    );

    if (hasAuthError) {
      // Don't intercept auth mutations themselves
      const opName = operation.operationName;
      if (
        opName === 'Login' ||
        opName === 'RefreshToken' ||
        opName === 'Register'
      ) {
        return;
      }

      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken =
          typeof window !== 'undefined'
            ? localStorage.getItem(REFRESH_TOKEN_KEY)
            : null;

        if (!refreshToken) {
          forceLogout();
          return;
        }

        // Use raw fetch to avoid Apollo error loop
        fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation RefreshToken($refreshToken: String!) {
              refreshToken(refreshToken: $refreshToken) {
                accessToken
                refreshToken
              }
            }`,
            variables: { refreshToken },
          }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.data?.refreshToken) {
              const newAccessToken = result.data.refreshToken.accessToken;
              localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
              localStorage.setItem(
                REFRESH_TOKEN_KEY,
                result.data.refreshToken.refreshToken
              );
              // Notify React state (useAuth) so it stays in sync
              tokenRefreshListeners.forEach((fn) => fn(newAccessToken));
              resolvePendingRequests();
            } else {
              rejectPendingRequests(new Error('Token refresh failed'));
              forceLogout();
            }
          })
          .catch((err) => {
            // Only force logout for non-connectivity errors (e.g. invalid refresh token)
            // For genuine network failures, keep the user logged in — they can retry
            const isNetworkFailure =
              err instanceof TypeError ||
              (err?.message?.toLowerCase()?.includes('failed to fetch'));
            if (isNetworkFailure) {
              // Network is down; error out pending operations so spinners stop
              rejectPendingRequests(
                new Error('Network unavailable. Please try again.'),
              );
            } else {
              rejectPendingRequests(err);
              forceLogout();
            }
          })
          .finally(() => {
            isRefreshing = false;
          });
      }

      // Queue the failed operation to retry after refresh completes
      return new Observable((observer) => {
        pendingRequests.push({
          resolve: () => {
            const newToken = localStorage.getItem(ACCESS_TOKEN_KEY);
            operation.setContext(({ headers = {} }: { headers: Record<string, string> }) => ({
              headers: {
                ...headers,
                authorization: newToken ? `Bearer ${newToken}` : '',
              },
            }));
            forward(operation).subscribe(observer);
          },
          reject: (err: Error) => {
            observer.error(err);
          },
        });
      });
    }

    // Non-auth errors: delegate to existing handler
    errorHandler({ graphQLErrors, networkError, operation, forward });
  }
);

const httpLink = new HttpLink({
  uri: '/api/graphql',
});

// Auth link to add token to requests
const authLink = setContext((_, { headers }) => {
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

const client = new ApolloClient({
  link: from([apolloErrorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;
