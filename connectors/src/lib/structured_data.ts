import { slugify } from "@dust-tt/types";

export function makeStructuredDataTableName(name: string) {
  // Keep a maximum of 32 characters of the name and slugify it.
  return slugify(name.substring(0, 32));
}
