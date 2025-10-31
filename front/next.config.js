// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StatsWriterPlugin } = require("webpack-stats-plugin");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bundleAnalyzer = require("@next/bundle-analyzer");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StatoscopeWebpackPlugin = require("@statoscope/webpack-plugin").default;

const isDev = process.env.NODE_ENV === "development";
const showReactScan = isDev && process.env.REACT_SCAN === "true";

const CONTENT_SECURITY_POLICIES = [
  "default-src 'none';",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' dust.tt *.dust.tt https://dust.tt https://*.dust.tt *.googletagmanager.com *.google-analytics.com *.hsforms.net *.hs-scripts.com *.hs-analytics.net *.hubspot.com *.hs-banner.com *.hscollectedforms.net *.usercentrics.eu *.cr-relay.com *.licdn.com *.datadoghq-browser-agent.com *.doubleclick.net *.hsadspixel.net *.wistia.net *.ads-twitter.com ${showReactScan ? "unpkg.com" : ""};`,
  `script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' dust.tt *.dust.tt https://dust.tt https://*.dust.tt *.googletagmanager.com *.google-analytics.com *.hsforms.net *.hs-scripts.com *.hs-analytics.net *.hubspot.com *.hs-banner.com *.hscollectedforms.net *.usercentrics.eu *.cr-relay.com *.licdn.com *.datadoghq-browser-agent.com *.doubleclick.net *.hsadspixel.net *.wistia.net *.hsappstatic.net *.hubspotusercontent-eu1.net import-cdn.default.com *.ads-twitter.com ${showReactScan ? "unpkg.com" : ""};`,
  `style-src 'self' 'unsafe-inline' *.fontawesome.com *.googleapis.com;`,
  `style-src-elem 'self' 'unsafe-inline' *.fontawesome.com *.googleapis.com *.gstatic.com;`,
  `img-src 'self' data: blob: webkit-fake-url: https:;`,
  `connect-src 'self' blob: dust.tt *.dust.tt https://dust.tt https://*.dust.tt browser-intake-datadoghq.eu *.google-analytics.com *.googlesyndication.com *.googleadservices.com cdn.jsdelivr.net *.hsforms.com *.hscollectedforms.net *.hubspot.com *.hubapi.com *.hsappstatic.net *.cr-relay.com *.usercentrics.eu *.ads.linkedin.com px.ads.linkedin.com google.com *.google.com *.workos.com translate-pa.googleapis.com forms.default.com nucleus.default.com *.default.com;`,
  `frame-src 'self' *.wistia.net eu.viz.dust.tt viz.dust.tt *.hsforms.net *.googletagmanager.com *.doubleclick.net *.default.com *.hsforms.com${isDev ? " http://localhost:3007" : ""};`,
  `font-src 'self' data: dust.tt *.dust.tt https://dust.tt https://*.dust.tt *.gstatic.com *.wistia.net fonts.cdnfonts.com migaku-public-data.migaku.com;`,
  `media-src 'self' data:;`,
  `object-src 'none';`,
  `form-action 'self' *.hsforms.com;`,
  `base-uri 'self';`,
  `frame-ancestors 'self';`,
  `manifest-src 'self';`,
  `worker-src 'self' blob:;`,
  `upgrade-insecure-requests;`,
].join(" ");

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const config = {
  transpilePackages: ["@uiw/react-textarea-code-editor"],
  // As of Next 14.2.3 swc minification creates a bug in the generated client side files.
  swcMinify: false,
  onDemandEntries: {
    // Keep dev-compiled pages around longer to avoid re-compiles on nav
    maxInactiveAge: 1000 * 60 * 60, // 1 hour
    pagesBufferLength: 200, // number of pages to keep "hot"
  },
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
        destination: "/home/platform-privacy",
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
        destination: "/w/:wId/conversation/:cId",
        permanent: true,
      },
      {
        source: "/w/:wId/assistant/:cId",
        destination: "/w/:wId/conversation/:cId",
        permanent: true,
      },
      {
        source: "/w/:wId/agent/:cId",
        destination: "/w/:wId/conversation/:cId",
        permanent: true,
      },
      {
        source: "/poke/:wId/conversations/:cId",
        destination: "/poke/:wId/conversation/:cId",
        permanent: true,
      },
      {
        source: "/contact",
        destination: "/home/contact",
        permanent: true,
      },
      {
        source: "/frames",
        destination: "/home/frames",
        permanent: true,
      },
      {
        source: "/pricing",
        destination: "/home/pricing",
        permanent: true,
      },
      {
        source: "/security",
        destination: "/home/security",
        permanent: true,
      },
      // Redirect all solutions pages from /solutions/* to /home/solutions/*
      {
        source: "/solutions/customer-support",
        destination: "/home/solutions/customer-support",
        permanent: true,
      },
      {
        source: "/solutions/data-analytics",
        destination: "/home/solutions/data-analytics",
        permanent: true,
      },
      {
        source: "/solutions/dust-platform",
        destination: "/home/solutions/dust-platform",
        permanent: true,
      },
      {
        source: "/solutions/engineering",
        destination: "/home/solutions/engineering",
        permanent: true,
      },
      {
        source: "/solutions/knowledge",
        destination: "/home/solutions/knowledge",
        permanent: true,
      },
      {
        source: "/solutions/marketing",
        destination: "/home/solutions/marketing",
        permanent: true,
      },
      {
        source: "/solutions/recruiting-people",
        destination: "/home/solutions/recruiting-people",
        permanent: true,
      },
      {
        source: "/solutions/sales",
        destination: "/home/solutions/sales",
        permanent: true,
      },
    ];
  },
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
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
      // Posthog tracking
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  webpack(config, { dev, isServer }) {
    if (process.env.BUILD_WITH_SOURCE_MAPS === "true" && !dev) {
      // Force webpack to generate source maps for both client and server code
      // This is used in production builds to upload source maps to Datadog for error tracking
      // Note: Next.js normally only generates source maps for client code in development
      config.devtool = "source-map";
    }

    if (!dev && !isServer && process.env.ANALYZE === "true") {
      config.plugins.push(
        new StatsWriterPlugin({
          filename: "../.next/analyze/webpack-stats.json",
          stats: {
            assets: true,
            chunks: true,
            modules: true,
          },
        }),
        new StatoscopeWebpackPlugin({
          saveReportTo: ".next/analyze/report-[name]-[hash].html",
          saveStatsTo: ".next/analyze/stats-[name]-[hash].json",
          open: false,
        })
      );
    }

    // Trim noisy watches in dev (don’t ignore node_modules)
    if (dev) {
      config.watchOptions = {
        ignored: [
          "**/.git/**",
          "**/.next/**",
          "**/logs/**",
          "**/*.log",
          "**/tmp/**",
        ],
      };
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
    // Only run source-map-loader when you really need it (prod or explicit debugging).
    if (!dev || process.env.WITH_DEP_SOURCEMAPS === "true") {
      config.module.rules.push({
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        include: [path.resolve(__dirname, "node_modules/@dust-tt/sparkle")],
      });
    }
    return config;
  },
  // We don't use next lint anymore, it's removed in next 16. So we disable it here.
  // eslint: false
};

module.exports = withBundleAnalyzer(config);
