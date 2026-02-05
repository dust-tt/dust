import { TemplateResource } from "@app/lib/resources/template_resource";

import type { SeedContext, TemplateAsset } from "./types";

export async function seedTemplate(
  ctx: SeedContext,
  asset: TemplateAsset
): Promise<TemplateResource | null> {
  const { execute, logger } = ctx;

  const existing = await TemplateResource.listAll();
  const found = existing.find((t) => t.handle === asset.handle);
  if (found) {
    logger.info({ handle: asset.handle }, "Template exists, skipping");
    return found;
  }

  if (execute) {
    const template = await TemplateResource.makeNew({
      handle: asset.handle,
      description: asset.description ?? null,
      emoji: asset.emoji,
      backgroundColor: asset.backgroundColor,
      visibility: asset.visibility,
      tags: asset.tags,
      presetInstructions: asset.presetInstructions ?? null,
      presetDescription: null,
      presetTemperature: "balanced",
      presetProviderId: "anthropic",
      presetModelId: "claude-sonnet-4-5-20250929",
      presetActions: [],
      helpInstructions: null,
      helpActions: null,
      copilotInstructions: asset.copilotInstructions ?? null,
      timeFrameDuration: null,
      timeFrameUnit: null,
    });
    logger.info(
      { handle: asset.handle, sId: template.sId },
      "Template created"
    );
    return template;
  }
  return null;
}

export async function seedTemplates(
  ctx: SeedContext,
  assets: TemplateAsset[]
): Promise<Map<string, TemplateResource>> {
  const created = new Map<string, TemplateResource>();
  for (const asset of assets) {
    const t = await seedTemplate(ctx, asset);
    if (t) {
      created.set(t.handle, t);
    }
  }
  return created;
}
