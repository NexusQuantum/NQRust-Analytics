import { ApolloClient, HttpLink, InMemoryCache, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import errorHandler from '@/utils/errorHandler';

const ACCESS_TOKEN_KEY = 'nqrust_access_token';

const apolloErrorLink = onError((error) => errorHandler(error));

const httpLink = new HttpLink({
  uri: '/api/graphql',
});

// Auth link to add token to requests
const authLink = setContext((_, { headers }) => {
  // Get the authentication token from local storage if it exists
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  // Return the headers to the context so httpLink can read them
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    }
  };
});

const client = new ApolloClient({
  link: from([apolloErrorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});

export default client;
