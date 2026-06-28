export default {
  async fetch(_req: Request): Promise<Response> {
    // Returns a plain object instead of a Response.
    return { status: 200 } as unknown as Response;
  },
};
