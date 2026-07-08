export const schema = {
  description: "Malformed input schema",
  input: { name: "string" } as unknown as never,
  output: undefined,
};

export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response("ok");
  },
};
