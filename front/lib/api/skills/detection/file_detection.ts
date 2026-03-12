import { parseSkillMarkdown } from "@app/lib/api/skills/detection/parsing";
import type { DetectedSkill } from "@app/lib/api/skills/detection/types";
import { detectSkillsFromZip } from "@app/lib/api/skills/detection/zip/detect_skills";
import { apiError } from "@app/logger/withlogging";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type formidable from "formidable";
import { readFileSync } from "fs";

const ACCEPTED_EXTENSIONS = new Set([".zip", ".skill", ".md"]);

type FileDetectionError = {
  message: string;
};

/**
 * Parses uploaded files (via formidable) and extracts detected skills.
 * Supports .md (standalone SKILL.md), .zip and .skill (ZIP archives).
 */
export function detectSkillsFromUploadedFiles(
  uploadedFiles: formidable.File[]
): Result<DetectedSkill[], FileDetectionError> {
  const allDetectedSkills: DetectedSkill[] = [];

  for (const file of uploadedFiles) {
    const filename = file.originalFilename ?? "";
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      return new Err({
        message: `Unsupported file type "${ext}". Accepted: .md, .zip, .skill`,
      });
    }

    const buffer = readFileSync(file.filepath);

    if (ext === ".zip" || ext === ".skill") {
      const result = detectSkillsFromZip({ zipBuffer: buffer });
      if (result.isErr()) {
        return new Err({ message: result.error.message });
      }
      allDetectedSkills.push(...result.value);
    } else {
      // .md file — treat as a standalone SKILL.md.
      const content = buffer.toString("utf-8");
      const parsed = parseSkillMarkdown(content);
      if (parsed.name) {
        allDetectedSkills.push({
          name: parsed.name,
          skillMdPath: filename,
          description: parsed.description,
          instructions: parsed.instructions,
          attachments: [],
        });
      }
    }
  }

  return new Ok(allDetectedSkills);
}
