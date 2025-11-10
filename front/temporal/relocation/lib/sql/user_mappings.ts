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

export function mapUserIdsInRow<T extends Record<string, any>>(
  row: T,
  userIdMapping: UserIdMapping
): T {
  let updatedRow: T | null = null;

  for (const column of USER_ID_COLUMN_NAMES) {
    if (!(column in row)) {
      continue;
    }

    const currentValue = row[column];
    if (currentValue === null || currentValue === undefined) {
      continue;
    }

    const mappedValue = userIdMapping.get(currentValue as ModelId);
    if (mappedValue !== undefined) {
      if (!updatedRow) {
        updatedRow = { ...row };
      }
      (updatedRow as Record<string, any>)[column] = mappedValue;
    }
  }

  return updatedRow ?? row;
}

export function mapUserIdsInRows<RowType extends Record<string, any>>(
  rows: RowType[],
  userIdMapping: UserIdMapping
): RowType[] {
  if (userIdMapping.size === 0) {
    return rows;
  }

  return rows.map((row) => mapUserIdsInRow(row, userIdMapping));
}
