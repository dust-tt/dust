import { z } from "zod";

export const IMPORT_TYPES = ["repository", "files"] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];

export function isImportType(value: string): value is ImportType {
  return IMPORT_TYPES.includes(value as ImportType);
}

const selectedSkillNames = z
  .array(z.string())
  .min(1, "Select at least one skill to import");

const repositoryImportSchema = z.object({
  importType: z.literal("repository"),
  repoUrl: z.string().min(1, "A repository URL is required"),
  selectedSkillNames,
});

const filesImportSchema = z.object({
  importType: z.literal("files"),
  selectedSkillNames,
});

export const importFormSchema = z.discriminatedUnion("importType", [
  repositoryImportSchema,
  filesImportSchema,
]);

export type ImportFormValues = z.infer<typeof importFormSchema>;

export type RepositoryImportFormValues = z.infer<typeof repositoryImportSchema>;

export type FilesImportFormValues = z.infer<typeof filesImportSchema>;
