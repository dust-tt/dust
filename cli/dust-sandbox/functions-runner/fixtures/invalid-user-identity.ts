import { z } from "zod";

export const schema = {
  userIdentity: "logged_in",
  input: z.object({}),
  output: z.object({}),
};
