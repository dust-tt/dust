// Echoes marker env vars so warm-server tests can observe which environment
// an invocation ran under.
export default {
  async fetch(): Promise<Response> {
    return Response.json({
      marker: process.env.WARM_TEST_MARKER ?? "unset",
      token: process.env.DUST_SANDBOX_TOKEN ?? "unset",
    });
  },
};
