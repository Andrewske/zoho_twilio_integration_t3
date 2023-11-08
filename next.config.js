/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    rewrites: async () => [
        {
            source: "/zoho",
            destination: "/",
        },
    ],
}

module.exports = nextConfig
