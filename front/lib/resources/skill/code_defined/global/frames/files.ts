import type { CodeDefinedSkillFile } from "@app/lib/resources/skill/code_defined/shared";
import { readFileSync } from "fs";

/**
 * @cc [owner:flvndvd,label:product] frame-skill-checker-assets
 * The Frame skill MUST attach the checker script, configs and lint plugin from the checked-in
 * assets. These files MUST remain resolvable from production API and worker bundles.
 */
export const FRAME_SKILL_FILES: readonly CodeDefinedSkillFile[] = [
  { fileName: "lint.sh", contentType: "text/x-shellscript" },
  { fileName: "tsconfig.json", contentType: "application/json" },
  { fileName: "oxlintrc.json", contentType: "application/json" },
  { fileName: "frame-rules.cjs", contentType: "text/javascript" },
].map(({ fileName, contentType }) => ({
  fileName,
  contentType,
  // Package resolution works in both source and bundled server entry points.
  content: readFileSync(
    require.resolve(
      `@dust-tt/front/lib/resources/skill/code_defined/global/frames/assets/${fileName}`
    ),
    "utf8"
  ),
}));
