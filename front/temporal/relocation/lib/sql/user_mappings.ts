import type { ModelId } from "@app/types/shared/model_id";

export type UserIdMapping = Map<ModelId, ModelId>;

export function mapUserIdsInRow(
  row: Record<string, any>,
  userIdMapping: UserIdMapping,
  userIdColumns: string[]
): Record<string, any> {
  let updatedRow: Record<string, any> | null = null;

  for (const column of userIdColumns) {
    if (!(column in row)) {
      continue;
    }

    const currentValue = row[column];
    if (currentValue === null || currentValue === undefined) {
      continue;
    }

    const mappedValue = userIdMapping.get(currentValue);
    if (mappedValue !== undefined) {
      updatedRow ??= { ...row };
      updatedRow[column] = mappedValue;
    }
  }

  return updatedRow ?? row;
}

export function mapUserIdsInRows(
  rows: Record<string, any>[],
  userIdMapping: UserIdMapping,
  userIdColumns: string[]
): Record<string, any>[] {
  if (userIdMapping.size === 0 || userIdColumns.length === 0) {
    return rows;
  }

  return rows.map((row) => mapUserIdsInRow(row, userIdMapping, userIdColumns));
}
