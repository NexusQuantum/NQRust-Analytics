import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { signOut } from 'next-auth/react';
import errorHandler from '@/utils/errorHandler';

const apolloErrorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  const hasAuthError = graphQLErrors?.some(
    (err) => err.extensions?.code === 'UNAUTHENTICATED'
  );

  if (hasAuthError) {
    // Sign out via NextAuth to properly clear the session cookie before redirecting.
    // Using window.location.href would skip cookie cleanup and risk a redirect loop.
    signOut({ callbackUrl: '/login' });
    return;
  }

  // Non-auth errors: delegate to existing handler
  errorHandler({ graphQLErrors, networkError, operation, forward });
});

const httpLink = new HttpLink({
  uri: '/api/graphql',
  credentials: 'include', // Send NextAuth session cookie with every GraphQL request
});

const client = new ApolloClient({
  link: from([apolloErrorLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;
