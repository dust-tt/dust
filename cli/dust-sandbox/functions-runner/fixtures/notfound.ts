export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response("nope", { status: 404 });
  },
};
