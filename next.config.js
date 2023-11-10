/** @type {import('next').NextConfig} */
const nextConfig = {
    // output: 'export',
    rewrites: async () => [
        {
            source: "/index",
            destination: "/",
        },
    ],

}

module.exports = nextConfig
