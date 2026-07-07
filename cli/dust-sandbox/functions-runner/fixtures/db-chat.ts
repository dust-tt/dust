import { z } from "zod";
import { users } from "./databases/chat.db.ts";

export const schema = {
  description: "List users of the chat database",
  databases: ["chat"],
  input: z.object({ limit: z.number().int().positive() }),
  output: z.object({ handles: z.array(z.string()) }),
};

export default {
  async fetch(_req: Request): Promise<Response> {
    // The fixture never opens the database; it only exercises the build-time manifest path.
    return Response.json({ handles: [users.handle.name] });
  },
};
