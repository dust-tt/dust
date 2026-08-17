import type { SandboxImageId } from "@app/lib/api/sandbox/image";
import {
  formatSandboxImageId,
  getRegisteredImages,
} from "@app/lib/api/sandbox/image";
import { listE2BTemplates } from "@app/lib/api/sandbox/providers/e2b_template";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Deploy gate: every image this revision of the code would start must already
// resolve to a template E2B can boot.
async function verifySandboxImages(): Promise<void> {
  const requiredIds = getRegisteredImages()
    .map((image) => image.imageId)
    .filter((id): id is SandboxImageId => id !== undefined)
    .map(formatSandboxImageId);

  const templatesResult = await listE2BTemplates();
  if (templatesResult.isErr()) {
    logger.error(
      { err: templatesResult.error },
      "Failed to list E2B templates"
    );
    process.exit(1);
  }

  const envdVersionByAlias = new Map<string, string | null>();
  for (const template of templatesResult.value) {
    for (const alias of template.aliases) {
      envdVersionByAlias.set(alias, template.envdVersion);
    }
  }

  // No alias at all means nothing ever tried to build the image; an alias with
  // no envd version is the symptom of a half-baked build, which the alias
  // existence check in `sandbox_image_check.ts` reads as already built.
  const missing: string[] = [];
  const unbuilt: string[] = [];
  for (const id of requiredIds) {
    const envdVersion = envdVersionByAlias.get(id);
    if (envdVersion === undefined) {
      missing.push(id);
    } else if (!envdVersion) {
      unbuilt.push(id);
    }
  }

  if (missing.length > 0 || unbuilt.length > 0) {
    logger.error(
      { missing, unbuilt, required: requiredIds },
      "Sandbox templates required by this revision are not deployable. Run " +
        "the Sandbox Image Registry workflow on main and retry."
    );
    process.exit(1);
  }

  logger.info(
    { required: requiredIds },
    "All required sandbox templates are built"
  );
}

verifySandboxImages()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error(
      { err: normalizeError(err) },
      "Sandbox image verification failed"
    );
    process.exit(1);
  });
