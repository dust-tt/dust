// Paths to exclude from sitemap and robots.txt for easier maintenance
const EXCLUDED_PATHS = [
  "/api*",
  "/w*",
  "/poke*",
  "/oauth*",
  "/sso-enforced",
  "/no-workspace",
  "/maintenance",
  "/login-error",
];

// Check if bot crawling is enabled via environment variable
const isBotCrawlingEnabled =
  process.env.NEXT_PUBLIC_ENABLE_BOT_CRAWLING === "true";

// Configure robots.txt policies based on environment variable
const getRobotsPolicies = () => {
  if (isBotCrawlingEnabled) {
    // Allow crawling with specific exclusions
    return [
      {
        userAgent: "*",
        allow: "/",
        disallow: EXCLUDED_PATHS,
      },
    ];
  } else {
    // Disallow all crawling when bot crawling is disabled or not set
    return [
      {
        userAgent: "*",
        disallow: "/",
      },
    ];
  }
};

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL,
  exclude: EXCLUDED_PATHS,
  generateIndexSitemap: false,
  changefreq: "weekly",
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: getRobotsPolicies(),
  },
};
