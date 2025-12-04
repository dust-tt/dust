import { z } from "zod";

export const skillBuilderFormSchema = z.object({
  name: z
    .string()
    .min(1, "Skill name is required")
    .refine((value) => !/\s/.test(value), "Skill name cannot contain spaces"),
  description: z.string().min(1, "Skill description is required"),
  instructions: z.string().min(1, "Skill instructions are required"),
});

export type SkillBuilderFormData = z.infer<typeof skillBuilderFormSchema>;
