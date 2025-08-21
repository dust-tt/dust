/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.DUST_PUBLIC_URL,
  exclude: ["/api/*", "/w/*", "/poke/*", "/oauth/*"],
  generateIndexSitemap: false,
  changefreq: "weekly",
  generateRobotsTxt: true,
};
