export default {
  async fetch(_req: Request): Promise<Response> {
    return { status: 200 } as unknown as Response;
  },
};
