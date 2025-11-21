import type { ModelId } from "@app/types";

export const USER_ID_COLUMN_NAMES = [
  "authorId",
  "editedByUserId",
  "editor",
  "invitedUserId",
  "sharedBy",
  "userId",
] as const;

export type UserIdMapping = Map<ModelId, ModelId>;

export function mapUserIdsInRow(
  row: Record<string, any>,
  userIdMapping: UserIdMapping
): Record<string, any> {
  let updatedRow: Record<string, any> | null = null;

  for (const column of USER_ID_COLUMN_NAMES) {
    if (!(column in row)) {
      continue;
    }

    const currentValue = row[column];
    if (currentValue === null || currentValue === undefined) {
      continue;
    }

    const mappedValue = userIdMapping.get(currentValue);
    if (mappedValue !== undefined) {
      if (!updatedRow) {
        updatedRow = { ...row };
      }
      updatedRow[column] = mappedValue;
    }
  }

  return updatedRow ?? row;
}

export function mapUserIdsInRows(
  rows: Record<string, any>[],
  userIdMapping: UserIdMapping
): Record<string, any>[] {
  if (userIdMapping.size === 0) {
    return rows;
  }

  return rows.map((row) => mapUserIdsInRow(row, userIdMapping));
}
