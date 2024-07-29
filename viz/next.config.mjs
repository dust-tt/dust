/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const CONTENT_SECURITY_POLICIES = `connect-src 'self'; media-src 'self'; frame-ancestors 'self' ${
  isDev ? "http://localhost:3000" : "https://dust.tt"
};`;

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: isDev ? "http://localhost:3000" : "https://dust.tt",
          },
          {
            key: "Content-Security-Policy",
            value: CONTENT_SECURITY_POLICIES,
          },
        ],
      },
      // Allow CORS for static files.
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
