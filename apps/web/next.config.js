//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const destination =
      process.env.CONTROL_PLANE_URL ||
      `http://127.0.0.1:${process.env.CONTROL_PLANE_PORT || '3000'}`;
    return [
      {
        source: '/api/:path*',
        destination: `${destination}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
