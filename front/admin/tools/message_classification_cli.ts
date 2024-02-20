import { classifyWorkspace } from "@app/admin/tools/message_classification";
import { makeScript } from "@app/migrations/helpers";

makeScript(
  {
    wId: { type: "string", demandOption: true },
    limit: { type: "number", demandOption: true },
  },
  async ({ execute, wId, limit }) => {
    if (execute) {
      await classifyWorkspace({ workspaceId: wId, limit });
    }
  }
);
