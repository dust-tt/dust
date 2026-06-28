// A real handler that forgot to declare a `schema` export.
export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response("ok");
  },
};
