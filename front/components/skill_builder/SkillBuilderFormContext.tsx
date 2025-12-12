import { createContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { actionSchema } from "@app/components/shared/tools_picker/types";
import { editorUserSchema } from "@app/types/editors";

export const skillBuilderFormSchema = z.object({
  name: z
    .string()
    .min(1, "Skill name is required")
    .refine((value) => !/\s/.test(value), "Skill name cannot contain spaces"),
  description: z.string().min(1, "Skill description is required"),
  instructions: z.string().min(1, "Skill instructions are required"),
  editors: z.array(editorUserSchema),
  tools: z.array(actionSchema),
  icon: z.string().nullable(),
});

export type SkillBuilderFormData = z.infer<typeof skillBuilderFormSchema>;

export const SkillBuilderFormContext =
  createContext<UseFormReturn<SkillBuilderFormData> | null>(null);
