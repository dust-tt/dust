import { z } from "zod";

const IMPORT_TYPES = ["repository"] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];

export const importFormSchema = z.object({
  importType: z.enum(IMPORT_TYPES),
  repoUrl: z.string().min(1, "Repository URL is required"),
  selectedSkillNames: z.array(z.string()),
});

export type ImportFormValues = z.infer<typeof importFormSchema>;
