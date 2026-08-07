// Sleeps briefly so warm-server tests can observe the busy reply.
export default {
  async fetch(): Promise<Response> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return Response.json({ done: true });
  },
};
