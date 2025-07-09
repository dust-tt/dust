export default async function setup() {
  // Naive system to make sure we are running on a test db
  if (
    !process.env.CONNECTORS_DATABASE_URI ||
    !process.env.CONNECTORS_DATABASE_URI.includes("test")
  ) {
    throw new Error(
      `CONNECTORS_DATABASE_URI must be set to a test DB (value: ${process.env.CONNECTORS_DATABASE_URI}). Action: make sure your have the correct environment variable set.`
    );
  }

  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `NODE_ENV must be set to "test" (value: ${process.env.NODE_ENV}). Action: make sure your have the correct environment variable set.`
    );
  }

  process.env = {
    // Keep essential Node vars
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,

    // Add any other essential vars you need to keep
    CONNECTORS_DATABASE_URI: process.env.CONNECTORS_DATABASE_URI,
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
  };
}
