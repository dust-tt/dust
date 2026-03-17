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
export function detectSkillsFromUploadedFiles(
  uploadedFiles: formidable.File[]
): Result<DetectedSkill[], FileDetectionError> {
  const allDetectedSkills: DetectedSkill[] = [];

  for (const file of uploadedFiles) {
    const filename = file.originalFilename ?? "";
    const ext = path.extname(filename).toLowerCase();

    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      return new Err({
        message: `Unsupported file type "${ext}". Accepted: .zip, .skill`,
      });
    }

    const buffer = readFileSync(file.filepath);
    const result = detectSkillsFromZip({ zipBuffer: buffer });
    if (result.isErr()) {
      return new Err({ message: result.error.message });
    }
    allDetectedSkills.push(...result.value);
  }

  return new Ok(allDetectedSkills);
}
