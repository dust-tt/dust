// Returns a payload of `size` bytes (default 2MB), far larger than any kernel
// pipe buffer: exercises drain-safe emission below the inline cap, the spill
// pointer above it, and the hard-cap refusal above that.
export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const size = Number(url.searchParams.get("size") ?? 2 * 1024 * 1024);
    return Response.json({ big: "x".repeat(size) });
  },
};
