/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    const apiDest = process.env.INTERNAL_API_URL ?? 'http://localhost:9081';
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${apiDest}/:path*`,
      },
    ];
  },
};

export default nextConfig;
