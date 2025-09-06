import { getIdsFromSId } from "@app/lib/resources/string_ids";

function main() {
  const sId = process.argv[2];

  if (!sId) {
    console.error("Usage: ts-node decode_sid.ts <sId>");
    process.exit(1);
  }

  const result = getIdsFromSId(sId);

  if (result.isErr()) {
    console.error("Error decoding sId:", result.error.message);
    process.exit(1);
  }

  const { workspaceModelId, resourceModelId } = result.value;

  console.log(`sId: ${sId}`);
  console.log(`Workspace ID: ${workspaceModelId}`);
  console.log(`Resource ID: ${resourceModelId}`);
}

main();
