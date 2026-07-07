import { z } from "zod";

export const schema = {
  description: "Declares a database whose schema file does not exist",
  databases: ["nosuchdb"],
  input: z.object({}),
  output: z.object({}),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return Response.json({});
  },
};
