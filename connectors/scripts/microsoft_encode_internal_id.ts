/**
 * Encode a nodeType and itemAPIPath into a Microsoft internalId.
 *
 * Usage:
 *   npx ts-node scripts/encode_internal_id.ts <nodeType> [itemAPIPath]
 *
 * Examples:
 *   npx ts-node scripts/encode_internal_id.ts sites-root
 *   npx ts-node scripts/encode_internal_id.ts folder /drives/b!abc123/items/014EON
 *   npx ts-node scripts/encode_internal_id.ts drive /drives/b!abc123
 *   npx ts-node scripts/encode_internal_id.ts file /drives/b!abc123/items/014EON
 */

const MICROSOFT_NODE_TYPES = [
  "sites-root",
  "site",
  "drive",
  "folder",
  "file",
  "page",
  "message",
  "worksheet",
] as const;

function encode(nodeType: string, itemAPIPath: string) {
  if (
    !MICROSOFT_NODE_TYPES.includes(
      nodeType as (typeof MICROSOFT_NODE_TYPES)[number]
    )
  ) {
    throw new Error(
      `Invalid nodeType: ${nodeType}. Valid types: ${MICROSOFT_NODE_TYPES.join(", ")}`
    );
  }

  const stringId =
    nodeType === "sites-root" ? nodeType : `${nodeType}/${itemAPIPath}`;

  return "microsoft-" + Buffer.from(stringId).toString("base64url");
}

const nodeType = process.argv[2];
const itemAPIPath = process.argv[3] || "";

if (!nodeType) {
  console.error(
    "Usage: npx ts-node scripts/encode_internal_id.ts <nodeType> [itemAPIPath]"
  );
  console.error(`Valid nodeTypes: ${MICROSOFT_NODE_TYPES.join(", ")}`);
  process.exit(1);
}

const result = encode(nodeType, itemAPIPath);
console.log(result);
