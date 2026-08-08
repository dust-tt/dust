// Top-level await delays the IMPORT itself, so tests can pin behaviors that
// depend on the worker being inside its pre-ack resolve/import phase.
await new Promise((resolve) => setTimeout(resolve, 400));

export default {
  async fetch(): Promise<Response> {
    return Response.json({ imported: true });
  },
};
