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
  `connect-src 'self' blob: dust.tt *.dust.tt https://dust.tt https://*.dust.tt browser-intake-datadoghq.eu *.google-analytics.com *.googlesyndication.com *.googleadservices.com cdn.jsdelivr.net *.hsforms.com *.hscollectedforms.net *.hubspot.com *.hubapi.com *.hsappstatic.net *.cr-relay.com *.usercentrics.eu *.ads.linkedin.com px.ads.linkedin.com google.com *.google.com *.workos.com translate-pa.googleapis.com forms.default.com nucleus.default.com *.default.com *.novu.co wss://*.novu.co;`,
  `frame-src 'self' *.wistia.net eu.viz.dust.tt viz.dust.tt *.hsforms.net *.googletagmanager.com *.doubleclick.net *.default.com *.hsforms.com *.youtube.com *.youtube-nocookie.com${isDev ? " http://localhost:3007" : ""};`,
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
  // Standalone output creates self-contained server with minimal dependencies for Docker. It
  // creates standalone folder that copies only the necessary files for a production deployment
  // including select files in node_modules.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.ctfassets.net",
      },
    ],
  },
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
    instrumentationHook: true,
    // Ensure dd-trace and other dependencies are included in standalone build.
    outputFileTracingIncludes: {
      "/**": [
        "./node_modules/dd-trace/**/*",
        "./node_modules/@datadog/**/*",
        // Include entire Redux ecosystem to avoid issues with partial inclusion.
        "./node_modules/redux/**/*",
        "./node_modules/@reduxjs/**/*",
        "./node_modules/immer/**/*",
        "./node_modules/reselect/**/*",
        "./node_modules/redux-thunk/**/*",
      ],
    },
  },
  async redirects() {
    return [
      // Customer Stories: Redirect from /blog to /customers
      {
        source:
          "/blog/how-patch-empowered-70-of-its-team-to-use-ai-agents-weekly",
        destination:
          "/customers/how-patch-empowered-70-of-its-team-to-use-ai-agents-weekly",
        permanent: true,
      },
      {
        source: "/blog/how-persona-hit-80-ai-agent-adoption-with-dust",
        destination:
          "/customers/how-persona-hit-80-ai-agent-adoption-with-dust",
        permanent: true,
      },
      {
        source:
          "/blog/how-cmi-strategies-achieved-95-ai-adoption-across-100-consultants-with-dust",
        destination:
          "/customers/how-cmi-strategies-achieved-95-ai-adoption-across-100-consultants-with-dust",
        permanent: true,
      },
      {
        source:
          "/blog/how-ardabelle-became-europes-first-ai-native-private-equity-fund",
        destination:
          "/customers/how-ardabelle-became-europes-first-ai-native-private-equity-fund",
        permanent: true,
      },
      {
        source:
          "/blog/how-42-ai-agents-transformed-insigns-end-to-end-consulting-workflow",
        destination:
          "/customers/how-42-ai-agents-transformed-insigns-end-to-end-consulting-workflow",
        permanent: true,
      },
      {
        source:
          "/blog/how-watershed-got-90-of-its-team-to-leverage-dust-agents",
        destination:
          "/customers/how-watershed-got-90-of-its-team-to-leverage-dust-agents",
        permanent: true,
      },
      {
        source: "/blog/why-mirakl-chose-dust-as-its-go-to-agentic-solution",
        destination:
          "/customers/why-mirakl-chose-dust-as-its-go-to-agentic-solution",
        permanent: true,
      },
      {
        source:
          "/blog/less-admin-more-selling-how-dust-frees-up-payfits-sales-team-to-close-more-deals",
        destination:
          "/customers/less-admin-more-selling-how-dust-frees-up-payfits-sales-team-to-close-more-deals",
        permanent: true,
      },
      {
        source:
          "/blog/how-wakam-cut-legal-contract-analysis-time-by-50-with-dust",
        destination:
          "/customers/how-wakam-cut-legal-contract-analysis-time-by-50-with-dust",
        permanent: true,
      },
      {
        source:
          "/blog/doctolibs-ai-adoption-playbook-from-30-person-pilot-to-company-wide-deployment",
        destination:
          "/customers/doctolibs-ai-adoption-playbook-from-30-person-pilot-to-company-wide-deployment",
        permanent: true,
      },
      {
        source: "/blog/doctolib-ai-transformation-blueprint-ciso-pers",
        destination:
          "/customers/doctolib-ai-transformation-blueprint-ciso-pers",
        permanent: true,
      },
      {
        source:
          "/blog/why-doctolibs-vp-of-data-stopped-internal-development-to-buy-dust",
        destination:
          "/customers/why-doctolibs-vp-of-data-stopped-internal-development-to-buy-dust",
        permanent: true,
      },
      {
        source:
          "/blog/why-doctolib-made-company-wide-enterprise-ai-a-national-cause",
        destination:
          "/customers/why-doctolib-made-company-wide-enterprise-ai-a-national-cause",
        permanent: true,
      },
      {
        source:
          "/blog/wakam-empowers-teams-with-self-service-data-intelligence-while-reducing-processing-time",
        destination:
          "/customers/wakam-empowers-teams-with-self-service-data-intelligence-while-reducing-processing-time",
        permanent: true,
      },
      {
        source:
          "/blog/alans-pmm-team-transforms-sales-conversations-into-intelligence-with-ai-agents",
        destination:
          "/customers/alans-pmm-team-transforms-sales-conversations-into-intelligence-with-ai-agents",
        permanent: true,
      },
      {
        source:
          "/blog/the-end-of-data-queues-how-alan-scaled-analytics-with-dust-2",
        destination:
          "/customers/the-end-of-data-queues-how-alan-scaled-analytics-with-dust-2",
        permanent: true,
      },
      {
        source: "/blog/long-live-the-builders-the-minh-trinh",
        destination: "/customers/long-live-the-builders-the-minh-trinh",
        permanent: true,
      },
      {
        source: "/blog/clay-scaling-gtme-team",
        destination: "/customers/clay-scaling-gtme-team",
        permanent: true,
      },
      {
        source: "/blog/customer-support-blueground",
        destination: "/customers/customer-support-blueground",
        permanent: true,
      },
      {
        source: "/blog/alan-marketing-customer-story-production-dust",
        destination: "/customers/alan-marketing-customer-story-production-dust",
        permanent: true,
      },
      {
        source: "/blog/malt-customer-support",
        destination: "/customers/malt-customer-support",
        permanent: true,
      },
      {
        source: "/blog/customer-story-lifen",
        destination: "/customers/customer-story-lifen",
        permanent: true,
      },
      {
        source: "/blog/kyriba-accelerating-innovation-with-dust",
        destination: "/customers/kyriba-accelerating-innovation-with-dust",
        permanent: true,
      },
      {
        source:
          "/blog/how-lucas-people-analyst-at-alan-introduced-dust-to-his-hr-team",
        destination:
          "/customers/how-lucas-people-analyst-at-alan-introduced-dust-to-his-hr-team",
        permanent: true,
      },
      {
        source: "/blog/qonto-dust-ai-partnership",
        destination: "/customers/qonto-dust-ai-partnership",
        permanent: true,
      },
      {
        source: "/blog/how-valentine-head-of-marketing-at-fleet-uses-dust",
        destination:
          "/customers/how-valentine-head-of-marketing-at-fleet-uses-dust",
        permanent: true,
      },
      {
        source: "/blog/generative-ai-insights-alan-payfit-leaders",
        destination: "/customers/generative-ai-insights-alan-payfit-leaders",
        permanent: true,
      },
      {
        source:
          "/blog/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi",
        destination:
          "/customers/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi",
        permanent: true,
      },
      {
        source: "/blog/dust-ai-payfit-efficiency",
        destination: "/customers/dust-ai-payfit-efficiency",
        permanent: true,
      },
      {
        source: "/blog/november-five-ai-transformation-dust",
        destination: "/customers/november-five-ai-transformation-dust",
        permanent: true,
      },
      {
        source: "/blog/integrating-ai-workflows-alan",
        destination: "/customers/integrating-ai-workflows-alan",
        permanent: true,
      },
      {
        source: "/blog/pennylane-customer-support-journey",
        destination: "/customers/pennylane-customer-support-journey",
        permanent: true,
      },
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
      // Posthog tracking - endpoint name called "subtle1"
      {
        source: "/subtle1/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/subtle1/:path*",
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

    if (isServer) {
      config.ignoreWarnings = [
        { module: /opentelemetry/ },
        { module: /require-in-the-middle/ },
      ];
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
