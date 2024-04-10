import { slugify } from "@dust-tt/types";
import { hash as blake3 } from "blake3";

// Extracting this helper due to incompatibility with blake3 in types.

export function makeStructuredDataTableName(name: string, externalId: string) {
  // Compute a blake3 hash of the externalId and name to avoid conflicts.
  const hash = blake3(`${externalId}-${name}`).toString("hex");

  // Define the prefix as the first 6 characters of the hash.
  const externalIdPrefix = hash.substring(0, 6);

  // Use the 6 last characters of the external id as a suffix (for user mapping to external data).
  const externalIdSuffix = externalId.toLowerCase().slice(-6);

  // Keep a maximum of 32 characters of the name.
  const truncatedName = name.substring(0, 32);

  // Concatenate everything.
  return slugify(`${truncatedName}_${externalIdPrefix}_${externalIdSuffix}`);
}
