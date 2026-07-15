import { z } from "zod";

export const schema = {
  output: z.any().superRefine(() => {
    throw new Error("refinement failed");
  }),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({ ok: true });
  },
};
