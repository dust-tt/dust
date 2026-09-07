/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

// Dev fronts that may embed viz. dust-hive envs run on other ports and list them in
// ALLOWED_VISUALIZATION_ORIGIN (the same variable the content page checks), so include those too.
const DEV_FRAME_ANCESTORS = [
  "http://localhost:3000",
  "http://localhost:3011",
  "http://localhost:3012",
  "chrome-extension://okjldflokifdjecnhbmkdanjjbnmlihg",
  "http://localhost:16011",
  ...(process.env.ALLOWED_VISUALIZATION_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const PROD_FRAME_ANCESTORS = [
  "https://dust.tt",
  "https://app.dust.tt",
  "https://eu.dust.tt",
  "https://front-edge.dust.tt",
  "https://eu.front-edge.dust.tt",
  "https://*.preview.dust.tt",
  "chrome-extension://okjldflokifdjecnhbmkdanjjbnmlihg",
  "chrome-extension://fnkfcndbgingjcbdhaofkcnhcjpljhdn",
];

const FRAME_ANCESTORS = [
  ...new Set(isDev ? DEV_FRAME_ANCESTORS : PROD_FRAME_ANCESTORS),
].join(" ");

const CONTENT_SECURITY_POLICIES = `connect-src 'self'; media-src 'self'; frame-ancestors 'self' https://app.frontapp.com ${FRAME_ANCESTORS} moz-extension:;`;

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
