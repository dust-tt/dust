import { z } from "zod";

export const schema = {
  output: z.any().transform(() => 1n),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({ ok: true });
  },
};
