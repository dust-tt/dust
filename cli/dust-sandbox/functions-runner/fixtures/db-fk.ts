import { z } from "zod";

export const schema = {
  description: "Declares a database whose schema uses foreign keys",
  databases: ["fk"],
  input: z.object({}),
  output: z.object({}),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({});
  },
};
