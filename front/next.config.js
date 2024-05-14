// eslint-disable-next-line @typescript-eslint/no-var-requires
const removeImports = require("next-remove-imports")();

module.exports = removeImports({
  experimental: { esmExternals: false },
  reactStrictMode: true,
  poweredByHeader: false,
  // TODO: revisit swcMinify with new version of Next 14/swc. As we moved to Next 14 we got the
  // following error client-side in production:
  // ```
  // _app-4cdd284a9fb0426b.js:1 Uncaught SyntaxError: Identifier 't' has already been declared
  // ```
  // See: https://github.com/dust-tt/dust/pull/5028
  // Make sure to deploy to font-edge before committing a remove of this flag.
  swcMinify: false,
  async redirects() {
    return [
      {
        source: "/website-privacy",
        destination:
          "https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084",
        permanent: true,
      },
      {
        source: "/platform-privacy",
        destination:
          "https://dust-tt.notion.site/Platform-Privacy-Policy-37ceefcd8442428d99a5a062d4d310c5?pvs=4",
        permanent: true,
      },
      {
        source: "/terms",
        destination:
          "https://dust-tt.notion.site/Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb",
        permanent: true,
      },
      {
        source: "/w/:wId/u/chat/:cId",
        destination: "/w/:wId/assistant/:cId",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*", // Match all paths
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://*.salesforce.com https://*.force.com;",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=86400", // 1 day in seconds
          },
        ],
      },
    ];
  },
  webpack: (config) => {
    // For `types` package import (which includes some dependence to server code).
    // Otherwise client-side code will throw an error when importing the packaged file.
    config.resolve.fallback = {
      fs: false,
      net: false,
      child_process: false,
      tls: false,
      dgram: false,
    };
    // For react-pdf imports to work client-side (as recommended in their docs).
    config.resolve.alias.canvas = false;
    return config;
  },
});
