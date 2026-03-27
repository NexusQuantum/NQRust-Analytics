import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, from } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import errorHandler from '@/utils/errorHandler';

const apolloErrorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  const hasAuthError = graphQLErrors?.some(
    (err) => err.extensions?.code === 'UNAUTHENTICATED'
  );

  if (hasAuthError) {
    // NextAuth manages session refresh automatically. On auth error just redirect to login.
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return;
  }

  // Non-auth errors: delegate to existing handler
  errorHandler({ graphQLErrors, networkError, operation, forward });
});

const httpLink = new HttpLink({
  uri: '/api/graphql',
  credentials: 'include', // Send NextAuth session cookie with every GraphQL request
});

// Passthrough link — auth is handled via NextAuth HttpOnly session cookie automatically
const authLink = new ApolloLink((operation, forward) => forward(operation));

const client = new ApolloClient({
  link: from([apolloErrorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;
