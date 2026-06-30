export default {
  async fetch(_req: Request): Promise<Response> {
    throw new Error("boom");
  },
};
