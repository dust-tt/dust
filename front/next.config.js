const path = require("path");

const showReactScan =
  process.env.NODE_ENV === "development" && process.env.REACT_SCAN === "true";

const CONTENT_SECURITY_POLICIES = [
  "default-src 'none';",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' dust.tt *.dust.tt https://dust.tt https://*.dust.tt *.googletagmanager.com *.google-analytics.com *.hsforms.net *.hs-scripts.com *.hs-analytics.net *.hubspot.com *.hs-banner.com *.hscollectedforms.net *.usercentrics.eu *.cr-relay.com *.licdn.com *.datadoghq-browser-agent.com *.doubleclick.net *.hsadspixel.net ${showReactScan ? "unpkg.com" : ""};`,
  `style-src 'self' 'unsafe-inline' *.fontawesome.com *.googleapis.com;`,
  `img-src 'self' data: https:;`,
  `connect-src 'self' blob: dust.tt *.dust.tt https://dust.tt https://*.dust.tt browser-intake-datadoghq.eu *.google-analytics.com *.googlesyndication.com *.googleadservices.com cdn.jsdelivr.net *.hsforms.com *.hscollectedforms.net *.hubspot.com *.hubapi.com *.cr-relay.com *.usercentrics.eu *.ads.linkedin.com px.ads.linkedin.com google.com *.google.com;`,
  `frame-src 'self' *.wistia.net eu.viz.dust.tt viz.dust.tt *.hsforms.net *.googletagmanager.com *.doubleclick.net;`,
  `font-src 'self' data: dust.tt *.dust.tt https://dust.tt https://*.dust.tt *.gstatic.com;`,
  `media-src 'self' data:;`,
  `object-src 'none';`,
  `form-action 'self';`,
  `base-uri 'self';`,
  `frame-ancestors 'self';`,
  `manifest-src 'self';`,
  `worker-src 'self' blob:;`,
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
          {
            key: "Content-Security-Policy",
            value: CONTENT_SECURITY_POLICIES,
          },
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
  webpack(config) {
    if (process.env.BUILD_WITH_SOURCE_MAPS === "true") {
      // Force webpack to generate source maps for both client and server code
      // This is used in production builds to upload source maps to Datadog for error tracking
      // Note: Next.js normally only generates source maps for client code in development
      config.devtool = "source-map";
    }
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
