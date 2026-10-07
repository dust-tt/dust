import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";

export const IMPORT_TYPES = ["repository", "files"] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];

export function isImportType(value: string): value is ImportType {
  return IMPORT_TYPES.includes(value as ImportType);
}

export function getImportFormSchema(
  t: (descriptor: MessageDescriptor) => string
) {
  const selectedSkillNames = z
    .array(z.string())
    .min(1, t(msg`Select at least one skill to import`));

  return z.discriminatedUnion("importType", [
    z.object({
      importType: z.literal("repository"),
      repoUrl: z.string().min(1, t(msg`A repository URL is required`)),
      selectedSkillNames,
    }),
    z.object({
      importType: z.literal("files"),
      selectedSkillNames,
    }),
  ]);
}

export type ImportFormValues = z.infer<ReturnType<typeof getImportFormSchema>>;

export type RepositoryImportFormValues = Extract<
  ImportFormValues,
  { importType: "repository" }
>;

export type FilesImportFormValues = Extract<
  ImportFormValues,
  { importType: "files" }
>;
