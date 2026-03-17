import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { detectSkillsFromZip } from "@app/lib/api/skills/detection/zip/detect_skills";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type formidable from "formidable";
import { readFile, unlink } from "fs/promises";
import path from "path";

const ACCEPTED_EXTENSIONS = new Set([".zip", ".skill"]);

interface FileDetectionError {
  message: string;
}

/**
 * Parses uploaded zip files (via formidable) and extracts detected skills.
 * Supports .zip and .skill (ZIP archives).
 */
export async function detectSkillsFromUploadedFiles(
  uploadedFiles: formidable.File[]
): Promise<Result<DetectedSkill[], FileDetectionError>> {
  for (const file of uploadedFiles) {
    const filename = file.originalFilename ?? "";
    const ext = path.extname(filename).toLowerCase();

    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      await cleanupTempFiles(uploadedFiles);
      return new Err({
        message: `Unsupported file type "${ext}". Accepted: .zip, .skill`,
      });
    }
  }

  const allDetectedSkills: DetectedSkill[] = [];

  for (const file of uploadedFiles) {
    const buffer = await readFile(file.filepath);
    await unlink(file.filepath).catch(() => {});
    const result = detectSkillsFromZip({ zipBuffer: buffer });
    if (result.isErr()) {
      await cleanupTempFiles(uploadedFiles);
      return new Err({ message: result.error.message });
    }
    allDetectedSkills.push(...result.value);
  }

  return new Ok(allDetectedSkills);
}

async function cleanupTempFiles(files: formidable.File[]): Promise<void> {
  await Promise.all(files.map((f) => unlink(f.filepath).catch(() => {})));
}
