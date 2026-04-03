import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  GET_WORKSPACE_METADATA_TOOL_NAME,
  POKE_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/poke/metadata";
import { connectorHandlers } from "@app/lib/api/actions/servers/poke/tools/connectors";
import { conversationHandlers } from "@app/lib/api/actions/servers/poke/tools/conversations";
import { userHandlers } from "@app/lib/api/actions/servers/poke/tools/users";
import {
  enforcePokeSecurityGates,
  getTargetAuth,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import { workspaceHandlers } from "@app/lib/api/actions/servers/poke/tools/workspace";
import { Ok } from "@app/types/shared/result";

const handlers: ToolHandlers<typeof POKE_TOOLS_METADATA> = {
  [GET_WORKSPACE_METADATA_TOOL_NAME]: async ({ workspace_id }, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_WORKSPACE_METADATA_TOOL_NAME,
      workspace_id
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const targetAuthResult = await getTargetAuth(workspace_id);
    if (targetAuthResult.isErr()) {
      return targetAuthResult;
    }
    const targetAuth = targetAuthResult.value;

    const targetWorkspace = targetAuth.getNonNullableWorkspace();
    const plan = targetAuth.plan();

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sId: targetWorkspace.sId,
            name: targetWorkspace.name,
            segmentation: targetWorkspace.segmentation,
            ssoEnforced:
              "ssoEnforced" in targetWorkspace
                ? targetWorkspace.ssoEnforced
                : undefined,
            plan: plan
              ? {
                  code: plan.code,
                  name: plan.name,
                }
              : null,
          },
          null,
          2
        ),
      },
    ]);
  },

  ...workspaceHandlers,
  ...connectorHandlers,
  ...conversationHandlers,
  ...userHandlers,
};

export const TOOLS = buildTools(POKE_TOOLS_METADATA, handlers);
