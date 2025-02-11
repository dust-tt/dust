module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transformIgnorePatterns: [
    "node_modules/(?!axios)/"
  ],
  testMatch: [
    "**/*.test.ts"
  ]
};
