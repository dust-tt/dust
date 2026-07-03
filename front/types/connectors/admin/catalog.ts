import { z } from "zod";

export const CliCommandOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  isNumber: z.boolean(),
});
export type CliCommandOption = z.infer<typeof CliCommandOptionSchema>;

export const CliCommandGroupSchema = z.object({
  majorCommand: z.string(),
  description: z.string(),
  subcommands: z.array(z.string()),
  options: z.array(CliCommandOptionSchema),
});
export type CliCommandGroup = z.infer<typeof CliCommandGroupSchema>;

export const CliCommandCatalogSchema = z.object({
  groups: z.array(CliCommandGroupSchema),
});
export type CliCommandCatalog = z.infer<typeof CliCommandCatalogSchema>;
