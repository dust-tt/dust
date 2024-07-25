/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

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
            value: isDev
              ? "frame-ancestors 'self' http://localhost:3000;"
              : "frame-ancestors 'self' https://dust.tt;",
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
