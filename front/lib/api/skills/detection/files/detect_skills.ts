import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { detectSkillsFromZip } from "@app/lib/api/skills/detection/zip/detect_skills";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type formidable from "formidable";
import { readFile, unlink } from "fs/promises";
import path from "path";

const ACCEPTED_EXTENSIONS = new Set([".zip", ".skill"]);

export type SkillFilesDetectionErrorCode =
  | "unsupported_file_type"
  | "invalid_archive";

export class SkillFilesDetectionError extends Error {
  constructor(
    readonly code: SkillFilesDetectionErrorCode,
    message: string
  ) {
    super(message);
  }
}

/**
 * Parses uploaded zip files (via formidable) and extracts detected skills.
 * Supports .zip and .skill (ZIP archives).
 */
export async function detectSkillsFromUploadedFiles(
  uploadedFiles: formidable.File[]
): Promise<Result<DetectedSkill[], SkillFilesDetectionError>> {
  for (const file of uploadedFiles) {
    const filename = file.originalFilename ?? "";
    const ext = path.extname(filename).toLowerCase();

    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      await cleanupTempFiles(uploadedFiles);
      return new Err(
        new SkillFilesDetectionError(
          "unsupported_file_type",
          `Unsupported file type "${ext}". Accepted: ${[...ACCEPTED_EXTENSIONS].join(", ")}`
        )
      );
    }
  }

  const allDetectedSkills: DetectedSkill[] = [];

  for (const file of uploadedFiles) {
    const buffer = await readFile(file.filepath);
    await unlink(file.filepath).catch(() => {});

    const result = detectSkillsFromZip({ zipBuffer: buffer });
    if (result.isErr()) {
      await cleanupTempFiles(uploadedFiles);
      return new Err(
        new SkillFilesDetectionError("invalid_archive", result.error.message)
      );
    }
    allDetectedSkills.push(...result.value);
  }

  return new Ok(allDetectedSkills);
}

async function cleanupTempFiles(files: formidable.File[]): Promise<void> {
  await concurrentExecutor(files, (f) => unlink(f.filepath).catch(() => {}), {
    concurrency: 8,
  });
}
