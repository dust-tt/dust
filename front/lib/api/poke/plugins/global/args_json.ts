import type { CliCommandOption } from "@app/types/connectors/admin/catalog";

// Builds the connectors admin `args` object from raw string form values:
// drops empty entries, coerces numeric params (per the catalog) to numbers,
// and ignores values that do not correspond to a known option.
export function buildAdminRunArgs(
  rawValues: Record<string, string>,
  options: CliCommandOption[]
): Record<string, unknown> {
  const optionByName = new Map(options.map((o) => [o.name, o]));
  const args: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(rawValues)) {
    const option = optionByName.get(name);
    if (!option || value === "") {
      continue;
    }
    args[name] = option.isNumber ? Number(value) : value;
  }

  return args;
}
