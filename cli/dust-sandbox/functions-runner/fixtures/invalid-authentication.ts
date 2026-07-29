import { z } from "zod";

export const schema = {
  authentication: "logged_in",
  input: z.object({}),
  output: z.object({}),
};
