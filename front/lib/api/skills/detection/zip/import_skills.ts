import { importDetectedSkills } from "@app/lib/api/skills/detection/import_detected_skills";
import type { ImportSkillsResult } from "@app/lib/api/skills/detection/types";
import { detectSkillsFromUploadedFiles } from "@app/lib/api/skills/detection/zip/file_detection";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type formidable from "formidable";

interface FileImportError {
  type: "invalid_files";
  message: string;
}

/**
 * Imports skills from uploaded files. Detects skills from the files,
 * then creates or updates SkillResource objects.
 */
export async function importSkillsFromFiles(
  auth: Authenticator,
  {
    uploadedFiles,
    names,
  }: {
    uploadedFiles: formidable.File[];
    names: string[];
  }
): Promise<Result<ImportSkillsResult, FileImportError>> {
  const detectResult = detectSkillsFromUploadedFiles(uploadedFiles);
  if (detectResult.isErr()) {
    return new Err({
      type: "invalid_files",
      message: detectResult.error.message,
    });
  }

  const result = await importDetectedSkills(auth, {
    detectedSkills: detectResult.value,
    names,
    source: "local_file",
    isFromSameSource: (existing) => existing.source === "local_file",
    getSourceMetadata: () => undefined,
  });

  return new Ok(result);
}
