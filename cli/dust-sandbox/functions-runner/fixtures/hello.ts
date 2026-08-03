export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    return Response.json({ hello: url.searchParams.get("name") ?? "world" });
  },
};
