import { z } from "zod";

export const schema = {
  description: "Declares the same database twice",
  databases: ["chat", "chat"],
  input: z.object({}),
  output: z.object({}),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({});
  },
};
