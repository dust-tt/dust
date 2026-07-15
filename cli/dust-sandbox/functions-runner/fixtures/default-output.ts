import { z } from "zod";

export const schema = {
  output: z.object({
    greeting: z.string(),
    tone: z.string().default("friendly"),
  }),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({ greeting: "Hi" });
  },
};
