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

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL,
  exclude: EXCLUDED_PATHS,
  generateIndexSitemap: false,
  changefreq: "weekly",
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
        disallow: EXCLUDED_PATHS,
      },
    ],
  },
};
