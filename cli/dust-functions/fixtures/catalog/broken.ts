// Throws at import time.
throw new Error("kaboom at import");

export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response("never");
  },
};
