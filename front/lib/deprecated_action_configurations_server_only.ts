import type { AgentActionConfigurationType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import type { AgentConfigurationWithoutActionsType } from "@app/lib/api/assistant/configuration";
import { AgentConfiguration } from "@app/lib/models";
import logger from "@app/logger/logger";

// TODO(@fontanierh) Temporary, to remove.
// This is a shadow write while we invert the relationship between configuration and actions.
export async function deprecatedMaybeShadowWriteFirstActionOnAgentConfiguration(
  actions: AgentActionConfigurationType[],
  agentConfiguration: AgentConfigurationWithoutActionsType
): Promise<void> {
  if (actions.length > 1) {
    logger.info(
      "Multiple actions found. Only the first action will be shadow written on the agent configuration."
    );
  }
  const firstActionConfig = actions.length ? actions[0] : null;
  if (firstActionConfig) {
    await AgentConfiguration.update(
      firstActionConfig.type === "retrieval_configuration"
        ? {
            retrievalConfigurationId: firstActionConfig.id,
          }
        : firstActionConfig.type === "tables_query_configuration"
        ? {
            tablesQueryConfigurationId: firstActionConfig.id,
          }
        : firstActionConfig.type === "dust_app_run_configuration"
        ? {
            dustAppRunConfigurationId: firstActionConfig.id,
          }
        : assertNever(firstActionConfig),
      {
        where: {
          id: agentConfiguration.id,
        },
      }
    );
  }
}
