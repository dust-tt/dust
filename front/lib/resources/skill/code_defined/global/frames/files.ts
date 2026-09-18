import type { CodeDefinedSkillFile } from "@app/lib/resources/skill/code_defined/shared";
import { isDevelopment } from "@app/types/shared/env";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { z } from "zod";

function getAssetPath(fileName: string): string {
  return require.resolve(
    `@dust-tt/front/lib/resources/skill/code_defined/global/frames/assets/${fileName}`
  );
}

/**
 * @cc [owner:flvndvd,label:product] frame-local-types-development-only
 * Locally built Viz declarations MUST only be attached in development. If no local manifest
 * exists, the skill MUST keep its normal download behavior. Locating the build MUST NOT add
 * a Viz runtime package dependency.
 */
function getLocalRuntimeTypes(): CodeDefinedSkillFile[] {
  if (!isDevelopment()) {
    return [];
  }

  const directory = path.join(
    path.dirname(getAssetPath("lint.sh")),
    "frame-runtime"
  );
  const manifestPath = path.join(directory, "manifest.json");
  if (!existsSync(manifestPath)) {
    return [];
  }

  const content = readFileSync(manifestPath, "utf8");
  const { tarballSha256 } = z
    .object({ tarballSha256: z.string().regex(/^[a-f0-9]{64}$/) })
    .parse(JSON.parse(content));
  return [
    {
      fileName: "frame-runtime.json",
      contentType: "application/json",
      content,
    },
    {
      fileName: "frame-runtime.tgz",
      contentType: "application/gzip",
      content: readFileSync(path.join(directory, `${tarballSha256}.tgz`)),
    },
  ];
}

const CHECKER_FILES: readonly CodeDefinedSkillFile[] = [
  { fileName: "lint.sh", contentType: "text/x-shellscript" },
  { fileName: "tsconfig.json", contentType: "application/json" },
  { fileName: "oxlintrc.json", contentType: "application/json" },
  { fileName: "frame-rules.cjs", contentType: "text/javascript" },
].map(({ fileName, contentType }) => ({
  fileName,
  contentType,
  // Package resolution works in both source and bundled server entry points.
  content: readFileSync(getAssetPath(fileName), "utf8"),
}));

/**
 * @cc [owner:flvndvd,label:product] frame-skill-checker-assets
 * The Frame skill MUST attach the checker script, configs and lint plugin from the checked-in
 * assets. These files MUST remain resolvable from production API and worker bundles.
 */
export const FRAME_SKILL_FILES: readonly CodeDefinedSkillFile[] = [
  ...CHECKER_FILES,
  ...getLocalRuntimeTypes(),
];
