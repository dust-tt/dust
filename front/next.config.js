// eslint-disable-next-line @typescript-eslint/no-var-requires
const removeImports = require("next-remove-imports")();

module.exports = removeImports({
  experimental: { esmExternals: true },
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
          "https://dust-tt.notion.site/Platform-Privacy-Policy-37ceefcd8442428d99a5a062d4d310c5?pvs=4",
        permanent: true,
      },
      {
        source: "/terms",
        destination:
          "https://dust-tt.notion.site/Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb",
        permanent: true,
      },
      {
        source: "/w/:wId/u/chat/:cId",
        destination: "/w/:wId/assistant/:cId",
        permanent: false,
      },
    ];
  },
});
