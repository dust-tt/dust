export default {
  async fetch(req: Request): Promise<Response> {
    const body = await req.text();
    return Response.json(`echo:${req.method}:${body}`);
  },
};
