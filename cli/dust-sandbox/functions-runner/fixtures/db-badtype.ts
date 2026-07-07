import { z } from "zod";

export const schema = {
  description: "Declares databases with the wrong type",
  databases: "chat",
  input: z.object({}),
  output: z.object({}),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({});
  },
};
