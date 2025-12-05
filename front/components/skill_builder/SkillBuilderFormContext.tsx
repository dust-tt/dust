import { createContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

const editorUserSchema = z.object({
  sId: z.string(),
  id: z.number(),
  createdAt: z.number(),
  provider: z
    .enum(["auth0", "github", "google", "okta", "samlp", "waad"])
    .nullable(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  image: z.string().nullable(),
  lastLoginAt: z.number().nullable(),
});

export const skillBuilderFormSchema = z.object({
  name: z
    .string()
    .min(1, "Skill name is required")
    .refine((value) => !/\s/.test(value), "Skill name cannot contain spaces"),
  description: z.string().min(1, "Skill description is required"),
  instructions: z.string().min(1, "Skill instructions are required"),
  scope: z.enum(["private", "workspace"]),
  editors: z.array(editorUserSchema),
});

export type SkillBuilderFormData = z.infer<typeof skillBuilderFormSchema>;

export const SkillBuilderFormContext =
  createContext<UseFormReturn<SkillBuilderFormData> | null>(null);
