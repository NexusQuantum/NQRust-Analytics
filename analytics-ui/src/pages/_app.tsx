import { AppProps } from 'next/app';
import Head from 'next/head';
import { Spin } from 'antd';
import posthog from 'posthog-js';
import apolloClient from '@/apollo/client';
import { GlobalConfigProvider } from '@/hooks/useGlobalConfig';
import { AuthProvider } from '@/hooks/useAuth';
import { PostHogProvider } from 'posthog-js/react';
import { ApolloProvider } from '@apollo/client';
import { defaultIndicator } from '@/components/PageLoading';
import LicenseGuard from '@/components/LicenseGuard';

require('../styles/index.less');

Spin.setDefaultIndicator(defaultIndicator);

function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>NQRust - Analytics</title>
        <link rel="icon" href="/favicon.ico?v=6" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/images/apple-touch-icon.png?v=6"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/images/favicon-32x32.png?v=6"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/images/favicon-16x16.png?v=6"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/images/nexus-analytics-logo-192.png?v=6"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/images/nexus-analytics-logo-512.png?v=6"
        />
      </Head>
      <GlobalConfigProvider>
        <ApolloProvider client={apolloClient}>
          <AuthProvider>
            <PostHogProvider client={posthog}>
              <LicenseGuard>
                <main className="app">
                  <Component {...pageProps} />
                </main>
              </LicenseGuard>
            </PostHogProvider>
          </AuthProvider>
        </ApolloProvider>
      </GlobalConfigProvider>
    </>
  );
}

export default App;
