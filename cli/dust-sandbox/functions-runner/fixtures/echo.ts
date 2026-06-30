export default {
  async fetch(req: Request): Promise<Response> {
    const body = await req.text();
    return new Response(`echo:${req.method}:${body}`, {
      headers: { "x-echo": "1" },
    });
  },
};
