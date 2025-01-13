module.exports = {
  testEnvironment: "./FixJSDOMEnvironment.ts",
  testRegex: "/tests/.*\\.(test|spec)?\\.(ts|tsx)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  preset: "ts-jest",
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
        },
      },
    ],
    "^.+\\.m?js$": "ts-jest",
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(jose|auth0|@auth0|sequelize|uuid|@panva|oidc-token-hash)/.*)",
  ],
  moduleNameMapper: {
    "^@app(.*)$": "<rootDir>/$1",
  },
  setupFiles: ["./jest.setup.js", "jest-canvas-mock"],
  cache: true,
  cacheDirectory: ".jest-cache",
  globalSetup: "./jest.globalSetup.js",
};
