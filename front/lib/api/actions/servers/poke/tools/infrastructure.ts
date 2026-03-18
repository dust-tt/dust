import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { POKE_TOOLS_METADATA } from "@app/lib/api/actions/servers/poke/metadata";
import {
  GET_KILL_SWITCHES_TOOL_NAME,
  GET_PRODUCTION_CHECKS_TOOL_NAME,
} from "@app/lib/api/actions/servers/poke/metadata";
import {
  enforcePokeSecurityGates,
  jsonResponse,
} from "@app/lib/api/actions/servers/poke/tools/utils";
import { getCheckSummaries } from "@app/lib/api/poke/production_checks";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";

type InfrastructureHandlers = Pick<
  ToolHandlers<typeof POKE_TOOLS_METADATA>,
  typeof GET_PRODUCTION_CHECKS_TOOL_NAME | typeof GET_KILL_SWITCHES_TOOL_NAME
>;

export const infrastructureHandlers: InfrastructureHandlers = {
  [GET_PRODUCTION_CHECKS_TOOL_NAME]: async (_params, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_PRODUCTION_CHECKS_TOOL_NAME
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const checks = await getCheckSummaries();

    return jsonResponse({
      count: checks.length,
      checks,
    });
  },

  [GET_KILL_SWITCHES_TOOL_NAME]: async (_params, extra) => {
    const gateResult = await enforcePokeSecurityGates(
      extra,
      GET_KILL_SWITCHES_TOOL_NAME
    );
    if (gateResult.isErr()) {
      return gateResult;
    }

    const killSwitches = await KillSwitchResource.listEnabledKillSwitches();

    return jsonResponse({
      count: killSwitches.length,
      killSwitches,
    });
  },
};
