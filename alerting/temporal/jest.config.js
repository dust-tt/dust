module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts"],
  transformIgnorePatterns: [
    "/node_modules/(?!axios|axios-.*)"
  ],
  transform: {
    "^.+\\.tsx?$": "ts-jest"
  },
  verbose: true,
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.spec.ts"]
};
