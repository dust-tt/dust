import { z } from "zod";

export type Tool = {
  fn: Function;
  input: z.ZodType<any>;
  output: z.ZodType<any>;
  description: string;
};
