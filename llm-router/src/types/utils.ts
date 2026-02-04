import { z } from "zod";

export const valueSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    value: schema,
  });

export type Value<T> = z.infer<ReturnType<typeof valueSchema<z.ZodType<T>>>>;
