/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL,
  exclude: [
    "/api*",
    "/w*",
    "/poke*",
    "/oauth*",
    "/sso-enforce",
    "/no-workspace",
    "/maintenance",
    "/login-error",
  ],
  generateIndexSitemap: false,
  changefreq: "weekly",
  generateRobotsTxt: true,
};
