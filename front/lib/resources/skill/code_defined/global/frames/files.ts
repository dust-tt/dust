import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { CodeDefinedSkillFile } from "@app/lib/resources/skill/code_defined/shared";
import { readFileSync } from "fs";

const loadSkillFile = ({
  fileName,
  contentType,
  assetName = fileName,
}: {
  fileName: string;
  contentType: string;
  assetName?: string;
}): CodeDefinedSkillFile => ({
  fileName,
  contentType,
  // Package resolution works in both source and bundled server entry points.
  content: readFileSync(
    require.resolve(
      `@dust-tt/front/lib/resources/skill/code_defined/global/frames/assets/${assetName}`
    ),
    "utf8"
  ),
});

/**
 * @cc [owner:flvndvd,label:product] frame-skill-checker-assets
 * The Frame skill MUST attach the checker script, configs and lint plugin from the checked-in
 * assets, along with an editable theme.ts example and slideshow.example.tsx. These files MUST
 * remain resolvable from production API and worker bundles.
 */
export const FRAME_SKILL_FILES: readonly CodeDefinedSkillFile[] = [
  { fileName: "lint.sh", contentType: "text/x-shellscript" },
  { fileName: "tsconfig.json", contentType: "application/json" },
  { fileName: "oxlintrc.json", contentType: "application/json" },
  { fileName: "frame-rules.cjs", contentType: "text/javascript" },
  {
    fileName: "theme.ts",
    assetName: "theme.ts.txt",
    contentType: "text/plain",
  },
  {
    fileName: "slideshow.example.tsx",
    assetName: "slideshow.example.tsx.txt",
    contentType: "text/plain",
  },
].map(loadSkillFile);

const DOCUMENT_SKILL_FILES: readonly CodeDefinedSkillFile[] = [
  { fileName: "document.md", contentType: "text/markdown" },
  {
    fileName: "document.example.tsx",
    assetName: "document.example.tsx.txt",
    contentType: "text/plain",
  },
  { fileName: "document.example.json", contentType: "application/json" },
].map(loadSkillFile);

export const fetchFrameSkillFiles = async (
  auth: Authenticator
): Promise<readonly CodeDefinedSkillFile[]> => {
  const flags = await getFeatureFlags(auth);
  if (flags.includes("frames_v2") && flags.includes("frame_documents")) {
    return [...FRAME_SKILL_FILES, ...DOCUMENT_SKILL_FILES];
  }

  return FRAME_SKILL_FILES;
};
