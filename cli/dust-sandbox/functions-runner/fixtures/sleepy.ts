// Sleeps for a caller-chosen duration so concurrency tests can control how
// long an invocation occupies its slot.
export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const delayMs = Number(url.searchParams.get("delayMs") ?? "100");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return Response.json({ done: true });
  },
};
