export default async function setup() {
  // Naive system to make sure we are running on a test db
  if (
    !process.env.FRONT_DATABASE_URI ||
    !process.env.FRONT_DATABASE_URI.includes("test")
  ) {
    throw new Error(
      `FRONT_DATABASE_URI must be set to a test DB (value: ${process.env.FRONT_DATABASE_URI}). Action: make sure your have the correct environnement variable set.`
    );
  }

  process.env = {
    // Keep essential Node vars
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,

    // Add any other essential vars you need to keep
    FRONT_DATABASE_URI: process.env.FRONT_DATABASE_URI,
    AUTH0_SECRET: "fake-auth0-secret",
    AUTH0_BASE_URL: "http://localhost:3000",
    AUTH0_CLIENT_ID: "auth0-client-id",
    AUTH0_ISSUER_BASE_URL: "https://dust-dev.eu.auth0.com",
    AUTH0_CLIENT_SECRET: "auth0-client-secret",
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
  };
}
