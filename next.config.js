const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',
  rewrites: async () => [
    {
      source: '/index',
      destination: '/',
    },
  ],
};

module.exports = withBundleAnalyzer(nextConfig);
