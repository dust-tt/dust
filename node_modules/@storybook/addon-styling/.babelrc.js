module.exports = {
  presets: [
    "@babel/preset-env",
    "@babel/preset-typescript",
    "@babel/preset-react",
  ],
  env: {
    esm: {
      presets: [
        [
          "@babel/preset-env",
          {
            shippedProposals: true,
            useBuiltIns: 'usage',
            corejs: '3',
            modules: false,
            targets: { chrome: '100' },
          },
        ],
      ],
    },
  },
};
