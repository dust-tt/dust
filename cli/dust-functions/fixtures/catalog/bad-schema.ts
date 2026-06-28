// Declares a schema whose `input` is not a Zod type.
export const schema = {
  description: "Has a malformed input schema",
  input: { name: "string" } as any,
  output: undefined,
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response("ok");
  },
};
