const path = require("path");

const CONTENT_SECURITY_POLICIES = [
  "default-src 'none';",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' *.googletagmanager.com *.google-analytics.com *.hsforms.net *.hs-scripts.com *.hs-analytics.net *.hubspot.com *.hs-banner.com *.hscollectedforms.net *.cr-relay.com *.plasmic.app *.posthog.com;`,
  `style-src 'self' 'unsafe-inline' *.plasmic.app fronts.googleapis.com;`,
  `img-src 'self' data: https:;`,
  `connect-src 'self' blob: *.google-analytics.com cdn.jsdelivr.net *.hsforms.com *.hscollectedforms.net *.hubspot.com *.cr-relay.com *.plasmic.app;`,
  `frame-src 'self' *.wistia.net eu.viz.dust.tt viz.dust.tt *.hsforms.net *.plasmic.app;`,
  `font-src 'self' data: dust.tt *.dust.tt;`,
  `object-src 'none';`,
  `form-action 'self';`,
  `base-uri 'self' studio.plasmic.app;`,
  `frame-ancestors 'self' *.plasmic.app;`,
  `manifest-src 'self';`,
  `worker-src 'self';`,
  `upgrade-insecure-requests;`,
].join(" ");

module.exports = {
  transpilePackages: ["@uiw/react-textarea-code-editor"],
  // As of Next 14.2.3 swc minification creates a bug in the generated client side files.
  swcMinify: false,
  experimental: {
    // Prevents minification of the temporalio client workflow ids.
    serverMinification: false,
    esmExternals: false,
  },
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
          "https://dust-tt.notion.site/Platform-Privacy-Policy-c75f1cd20df04c58872f6aa43f768d41?pvs=74",
        permanent: true,
      },
      {
        source: "/terms",
        destination:
          "https://dust-tt.notion.site/17bb854ffc674e1ba729d1a10837e50d?v=de92d1770a344beeafe9f701e78ad8f3",
        permanent: true,
      },
      {
        source: "/jobs",
        destination: "https://jobs.ashbyhq.com/dust",
        permanent: true,
      },
      {
        source: "/w/:wId/u/chat/:cId",
        destination: "/w/:wId/assistant/:cId",
        permanent: false,
      },
    ];
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*", // Match all paths
        headers: [
          // {
          //   key: "Content-Security-Policy",
          //   value: CONTENT_SECURITY_POLICIES,
          // },
          {
            key: "Strict-Transport-Security",
            value: "max-age=86400", // 1 day in seconds
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Legacy endpoint rewrite to maintain compatibility for users still hitting `/vaults/`
      // endpoints on the public API.
      {
        source: "/api/v1/w/:wId/vaults/:vId/:path*",
        destination: "/api/v1/w/:wId/spaces/:vId/:path*",
      },
      {
        source: "/api/v1/w/:wId/vaults",
        destination: "/api/v1/w/:wId/spaces",
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
    // Use source-map-loader for transitively include source maps of dependencies.
    config.module.rules.push({
      test: /\.js$/,
      use: ["source-map-loader"],
      enforce: "pre",
      include: [path.resolve(__dirname, "node_modules/@dust-tt/sparkle")],
    });
    return config;
  },
};
