import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { z } from "zod";

export const IMPORT_TYPES = ["repository", "files"] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];

export function isImportType(value: string): value is ImportType {
  return IMPORT_TYPES.includes(value as ImportType);
}

export function useImportFormSchema() {
  const { t } = useLingui();

  return useMemo(() => {
    const selectedSkillNames = z
      .array(z.string())
      .min(1, t`Select at least one skill to import`);

    return z.discriminatedUnion("importType", [
      z.object({
        importType: z.literal("repository"),
        repoUrl: z.string().min(1, t`A repository URL is required`),
        selectedSkillNames,
      }),
      z.object({
        importType: z.literal("files"),
        selectedSkillNames,
      }),
    ]);
  }, [t]);
}

export type ImportFormValues = z.infer<ReturnType<typeof useImportFormSchema>>;

export type RepositoryImportFormValues = Extract<
  ImportFormValues,
  { importType: "repository" }
>;

export type FilesImportFormValues = Extract<
  ImportFormValues,
  { importType: "files" }
>;
