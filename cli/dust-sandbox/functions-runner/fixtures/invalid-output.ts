import { z } from "zod";

export const schema = {
  output: z.object({ greeting: z.string() }),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({ greeting: 42 });
  },
};
