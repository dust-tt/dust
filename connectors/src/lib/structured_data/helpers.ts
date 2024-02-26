import { slugify } from "@dust-tt/types";

export function makeStructuredDataTableName(name: string, tableId: string) {
  return slugify(`${name}_${tableId.slice(-4)}`);
}
