/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const withLess = require('next-with-less');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const resolveAlias = {
  antd$: path.resolve(__dirname, 'src/import/antd'),
};

/** @type {import('next').NextConfig} */
const nextConfig = withLess({
  output: 'standalone',
  staticPageGenerationTimeout: 1000,
  // Ensure ESM packages from Ant Design ecosystem are transpiled by Next.js
  transpilePackages: [
    '@ant-design/icons-svg',
    'rc-util',
    'rc-align',
    'rc-cascader',
    'rc-checkbox',
    'rc-collapse',
    'rc-dialog',
    'rc-drawer',
    'rc-dropdown',
    'rc-field-form',
    'rc-image',
    'rc-input',
    'rc-input-number',
    'rc-menu',
    'rc-notification',
    'rc-pagination',
    'rc-picker',
    'rc-progress',
    'rc-rate',
    'rc-select',
    'rc-slider',
    'rc-steps',
    'rc-switch',
    'rc-table',
    'rc-tabs',
    'rc-tooltip',
    'rc-tree',
    'rc-tree-select',
    'rc-upload',
  ],
  compiler: {
    // Enables the styled-components SWC transform
    styledComponents: {
      displayName: true,
      ssr: true,
    },
  },
  lessLoaderOptions: {
    additionalData: `@import "@/styles/antd-variables.less";`,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...resolveAlias,
    };
    return config;
  },
  // routes redirect
  async redirects() {
    return [
      {
        source: '/setup',
        destination: '/setup/connection',
        permanent: true,
      },
    ];
  },
});

module.exports = withBundleAnalyzer(nextConfig);
