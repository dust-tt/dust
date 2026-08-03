const EXCLUDED_PATHS = ["/m/api*", "/api*"];

const isBotCrawlingEnabled =
  process.env.NEXT_PUBLIC_ENABLE_BOT_CRAWLING === "true";

const getRobotsPolicies = () => {
  if (isBotCrawlingEnabled) {
    return [
      {
        userAgent: "*",
        allow: "/",
        disallow: EXCLUDED_PATHS,
      },
    ];
  } else {
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
  siteUrl: process.env.NEXT_PUBLIC_DUST_MARKETING_URL,
  exclude: EXCLUDED_PATHS,
  generateIndexSitemap: false,
  changefreq: "weekly",
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: getRobotsPolicies(),
  },
};
