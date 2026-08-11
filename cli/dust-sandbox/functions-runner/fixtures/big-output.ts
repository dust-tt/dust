// Returns a payload far larger than any kernel pipe buffer, so an exit that
// drops queued stdout writes truncates the result envelope mid-JSON.
export default {
  async fetch(): Promise<Response> {
    return Response.json({ big: "x".repeat(2 * 1024 * 1024) });
  },
};
