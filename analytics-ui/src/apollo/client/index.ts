import { ApolloClient, HttpLink, InMemoryCache, from, Observable } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import errorHandler from '@/utils/errorHandler';

const ACCESS_TOKEN_KEY = 'nqrust_access_token';
const REFRESH_TOKEN_KEY = 'nqrust_refresh_token';

// Track in-flight refresh to prevent concurrent refresh storms
let isRefreshing = false;
let pendingRequests: Array<() => void> = [];

const resolvePendingRequests = () => {
  pendingRequests.forEach((cb) => cb());
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
              localStorage.setItem(
                ACCESS_TOKEN_KEY,
                result.data.refreshToken.accessToken
              );
              localStorage.setItem(
                REFRESH_TOKEN_KEY,
                result.data.refreshToken.refreshToken
              );
              resolvePendingRequests();
            } else {
              pendingRequests = [];
              forceLogout();
            }
          })
          .catch(() => {
            pendingRequests = [];
            forceLogout();
          })
          .finally(() => {
            isRefreshing = false;
          });
      }

      // Queue the failed operation to retry after refresh completes
      return new Observable((observer) => {
        pendingRequests.push(() => {
          const newToken = localStorage.getItem(ACCESS_TOKEN_KEY);
          operation.setContext(({ headers = {} }: { headers: Record<string, string> }) => ({
            headers: {
              ...headers,
              authorization: newToken ? `Bearer ${newToken}` : '',
            },
          }));
          forward(operation).subscribe(observer);
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
