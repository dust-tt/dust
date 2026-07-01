import { z } from "zod";

export const schema = {
  description: "Greet a user by name",
  input: z.object({ name: z.string(), formal: z.boolean().optional() }),
  output: z.object({ greeting: z.string() }),
};

export default {
  async fetch(req: Request): Promise<Response> {
    const { name, formal } = (await req.json()) as {
      name: string;
      formal?: boolean;
    };
    return Response.json({
      greeting: `${formal ? "Good day" : "Hi"}, ${name}`,
    });
  },
};
