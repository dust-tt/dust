/**
 * Upserts templates from a CSV into the database and
 * sets copilotInstructions to null on any existing template not present in the CSV.
 *
 * Expected CSV columns (all required):
 *   - "Use Case"                  — used as handle (no transformation)
 *   - "Agent Facing Description"
 *   - "User Facing Description"
 *   - "Sidekick Prompt"           — stored as copilotInstructions
 *   - "Tag"                       — maps to TemplateTagCodeType
 *   - "Emoji"                     — e.g. "sparkles/2728"
 *   - "Background Color"          — e.g. "bg-blue-300"
 *
 * Usage (from front/ directory):
 *   Dry-run:  npx tsx scripts/migrate_copilot_templates_from_csv.ts --csvPath /path/to/file.csv
 *   Execute:  npx tsx scripts/migrate_copilot_templates_from_csv.ts --csvPath /path/to/file.csv --execute
 */

import { TemplateResource } from "@app/lib/resources/template_resource";
import type { Logger } from "@app/logger/logger";
import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";
import type {
  TemplateActionPreset,
  TemplateTagCodeType,
} from "@app/types/assistant/templates";
import { TEMPLATES_TAGS_CONFIG } from "@app/types/assistant/templates";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

const CSV_COL = {
  USE_CASE: "Use Case",
  AGENT_FACING: "Agent Facing Description",
  USER_FACING: "User Facing Description",
  SIDEKICK_PROMPT: "Sidekick Prompt",
  TAG: "Tag",
  EMOJI: "Emoji",
  BACKGROUND_COLOR: "Background Color",
} as const;

const REQUIRED_COLS = [
  CSV_COL.USE_CASE,
  CSV_COL.AGENT_FACING,
  CSV_COL.USER_FACING,
  CSV_COL.SIDEKICK_PROMPT,
  CSV_COL.TAG,
  CSV_COL.EMOJI,
  CSV_COL.BACKGROUND_COLOR,
] as const;

const TAG_LABEL_TO_CODE = Object.fromEntries(
  Object.entries(TEMPLATES_TAGS_CONFIG).map(([code, { label }]) => [
    label,
    code as TemplateTagCodeType,
  ])
);

export function resolveTag(label: string): TemplateTagCodeType {
  const code = TAG_LABEL_TO_CODE[label.trim()];
  if (!code) {
    throw new Error(
      `Unknown tag: "${label}". Must be one of: ${Object.values(
        TEMPLATES_TAGS_CONFIG
      )
        .map((c) => c.label)
        .join(", ")}`
    );
  }
  return code;
}

type CsvRecord = Record<string, string | undefined>;

interface TemplateRow {
  handle: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  copilotInstructions: string;
  tags: TemplateTagCodeType[];
  emoji: string;
  backgroundColor: string;
}

export function parseCsvRows(csvPath: string, logger?: Logger): TemplateRow[] {
  const content = readFileSync(csvPath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as CsvRecord[];

  const rowMap = new Map<string, TemplateRow>();

  for (const record of records) {
    const values = REQUIRED_COLS.map((col) => record[col]?.trim() ?? "");
    const missing = REQUIRED_COLS.filter((_col, i) => !values[i]);

    if (missing.length > 0) {
      if (logger) {
        logger.warn(
          { missing, useCase: values[0] || "(empty)" },
          "Skipping row: missing required columns"
        );
      }
      continue;
    }

    const [
      handle,
      agentFacingDescription,
      userFacingDescription,
      copilotInstructions,
      tagRaw,
      emoji,
      backgroundColor,
    ] = values;
    const tag = resolveTag(tagRaw);

    rowMap.set(handle, {
      handle,
      agentFacingDescription,
      userFacingDescription,
      copilotInstructions,
      tags: [tag],
      emoji,
      backgroundColor,
    });
  }

  return Array.from(rowMap.values());
}

const argumentSpecs: ArgumentSpecs = {
  csvPath: {
    type: "string",
    description: "Path to the Internal Dust Use Cases CSV file",
    demandOption: true,
  },
};

const PRESET_DEFAULTS = {
  // These preset fields will be removed after copilot launch
  presetTemperature: "balanced" as const,
  presetProviderId: "anthropic" as const,
  presetModelId: "claude-sonnet-4-5-20250929" as const,
  presetActions: [] as TemplateActionPreset[],
  presetDescription: null,
  presetInstructions: null,
  helpInstructions: null,
  helpActions: null,
  timeFrameDuration: null,
  timeFrameUnit: null,
};

makeScript(argumentSpecs, async ({ csvPath, execute }, logger) => {
  const rows = parseCsvRows(csvPath, logger);
  logger.info({ csvPath, rowCount: rows.length }, "Parsed CSV");

  const allTemplates = await TemplateResource.listAll();
  const templateByHandle = new Map(allTemplates.map((t) => [t.handle, t]));
  const csvHandles = new Set(rows.map((r) => r.handle));

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = templateByHandle.get(row.handle);

    if (existing) {
      logger.info({ handle: row.handle, execute }, "Updating template");
      if (execute) {
        await existing.updateAttributes({
          agentFacingDescription: row.agentFacingDescription,
          userFacingDescription: row.userFacingDescription,
          copilotInstructions: row.copilotInstructions,
          tags: row.tags,
          emoji: row.emoji,
          backgroundColor: row.backgroundColor,
        });
      }
      updated++;
    } else {
      logger.info({ handle: row.handle, execute }, "Creating template");
      if (execute) {
        await TemplateResource.makeNew({
          handle: row.handle,
          agentFacingDescription: row.agentFacingDescription,
          userFacingDescription: row.userFacingDescription,
          copilotInstructions: row.copilotInstructions,
          tags: row.tags,
          emoji: row.emoji,
          backgroundColor: row.backgroundColor,
          visibility: "published",
          ...PRESET_DEFAULTS,
        });
      }
      created++;
    }
  }

  // Clear copilotInstructions on templates that are not in the CSV.
  const toClear = allTemplates.filter(
    (t) =>
      !csvHandles.has(t.handle) &&
      t.copilotInstructions !== null &&
      t.copilotInstructions.trim() !== ""
  );
  let cleared = 0;

  if (toClear.length > 0) {
    logger.info(
      { count: toClear.length, handles: toClear.map((t) => t.handle), execute },
      "Clearing copilotInstructions on templates not in CSV"
    );
    if (execute) {
      for (const template of toClear) {
        await template.updateAttributes({ copilotInstructions: null });
        cleared++;
      }
    }
  }

  logger.info({ execute, created, updated, cleared }, "Migration complete");
});
