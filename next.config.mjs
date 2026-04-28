import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
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

export default withBundleAnalyzer(nextConfig);
