import { z } from "zod";

export const schema = {
  description: "Declares a database name violating the name contract",
  databases: ["ChatDb"],
  input: z.object({}),
  output: z.object({}),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({});
  },
};
