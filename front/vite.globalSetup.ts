export default async function setup() {
  // Naive system to make sure we are running on a test db
  if (
    !process.env.FRONT_DATABASE_URI ||
    !process.env.FRONT_DATABASE_URI.includes("test")
  ) {
    throw new Error(
      `FRONT_DATABASE_URI must be set to a test DB (value: ${process.env.FRONT_DATABASE_URI}). Action: make sure your have the correct environment variable set.`
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
    FRONT_DATABASE_URI: process.env.FRONT_DATABASE_URI,
    NEXT_PUBLIC_DUST_CLIENT_FACING_URL: "http://fake-url",
    DUST_US_URL: "http://fake-url",
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
  };
}
