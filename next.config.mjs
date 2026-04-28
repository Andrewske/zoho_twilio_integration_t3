import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'pgpass'],
  rewrites: async () => [
    {
      source: '/index',
      destination: '/',
    },
  ],
};

export default withBundleAnalyzer(nextConfig);
