import { z } from "zod";

export const schema = {
  description: "Greet a user by name",
  input: z.object({
    name: z.string(),
    formal: z.boolean().optional(),
  }),
  output: z.object({ greeting: z.string() }),
};

export default {
  async fetch(req: Request): Promise<Response> {
    // Trusts its input: run_request validates the body against `schema.input`
    // before this handler is ever called.
    const { name, formal } = (await req.json()) as {
      name: string;
      formal?: boolean;
    };
    const greeting = `${formal ? "Good day" : "Hi"}, ${name}`;
    return Response.json({ greeting });
  },
};
