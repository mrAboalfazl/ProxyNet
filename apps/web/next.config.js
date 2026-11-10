//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const cpPort = process.env.CONTROL_PLANE_PORT || '3000';
    return [
      {
        source: '/api/:path*',
        destination: `http://127.0.0.1:${cpPort}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
