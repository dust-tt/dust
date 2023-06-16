// eslint-disable-next-line @typescript-eslint/no-var-requires
const removeImports = require("next-remove-imports")();

module.exports = removeImports({
  experimental: { esmExternals: true },
  async redirects() {
    return [
      {
        source: '/privacy',
        destination: 'https://dust-tt.notion.site/Privacy-1a329ca7b8e349e88b5ec3277fe35189',
        permanent: true,
      },
      {
        source: '/terms',
        destination: 'https://dust-tt.notion.site/Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb',
        permanent: true,
      },
    ]
  },
});
