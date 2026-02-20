/**
 * Decode a Microsoft internalId into its nodeType and itemAPIPath.
 *
 * Usage:
 *   npx ts-node scripts/decode_internal_id.ts <internalId>
 *
 * Example:
 *   npx ts-node scripts/decode_internal_id.ts microsoft-Zm9sZGVyLy9kcml2ZXMvYiFTblg3...
 */

import { isValidNodeType } from "@connectors/connectors/microsoft/lib/types";

function decode(internalId: string) {
  if (!internalId.startsWith("microsoft-")) {
    throw new Error(`Invalid internal id: ${internalId}`);
  }

  const decodedId = Buffer.from(
    internalId.slice("microsoft-".length),
    "base64url"
  ).toString();

  if (decodedId === "sites-root") {
    return { nodeType: "sites-root", itemAPIPath: "" };
  }

  const [nodeType, ...rest] = decodedId.split("/");
  if (!nodeType || !isValidNodeType(nodeType)) {
    throw new Error(`Invalid nodeType: ${nodeType} (decoded: ${decodedId})`);
  }

  return { nodeType, itemAPIPath: rest.join("/") };
}

const internalId = process.argv[2];
if (!internalId) {
  console.error(
    "Usage: npx ts-node scripts/decode_internal_id.ts <internalId>"
  );
  process.exit(1);
}

const result = decode(internalId);
console.log(JSON.stringify(result, null, 2));
