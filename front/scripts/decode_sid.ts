import { getIdsFromSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    sId: {
      type: "string",
      alias: "s",
      description: "String ID to decode",
      required: true,
    },
  },
  async ({ sId }, _logger) => {
    const result = getIdsFromSId(sId);

    if (result.isErr()) {
      throw new Error(`Error decoding sId: ${result.error.message}`);
    }

    const { workspaceModelId, resourceModelId } = result.value;

    console.log(`sId: ${sId}`);
    console.log(`Workspace ID: ${workspaceModelId}`);
    console.log(`Resource ID: ${resourceModelId}`);
  }
);
