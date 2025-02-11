module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.ts", "**/*.test.ts"],
  setupFiles: ["./jest.setup.js"]
};
