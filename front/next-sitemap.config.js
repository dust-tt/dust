const EXCLUDED_PATHS = [
  "/api*",
  "/w*",
  "/poke*",
  "/oauth*",
  "/sso-enforced",
  "/no-workspace",
  "/maintenance",
  "/login-error",

  // URLs that we don't want to display on purpose
  "/home/industry/investment-firms",
  "/home/industry/energy-utilities",
  "/home/slack/slack-integration",
  "/home/industry/media",
  "/home/industry/consulting",
  "/home/industry/industrial-manufacturing ",
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
