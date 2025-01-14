import type {
  GithubGetPullRequestConfigurationType,
  ModelId,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { Op } from "sequelize";

import { DEFAULT_GITHUB_GET_PULL_REQUEST_ACTION_NAME } from "@app/lib/api/assistant/actions/constants";
import { AgentGithubConfiguration } from "@app/lib/models/assistant/actions/github";

export async function fetchGithubActionConfigurations({
  configurationIds,
  variant,
}: {
  configurationIds: ModelId[];
  variant: "light" | "full";
}): Promise<Map<ModelId, GithubGetPullRequestConfigurationType[]>> {
  if (variant !== "full") {
    return new Map();
  }

  const githubConfigurations = await AgentGithubConfiguration.findAll({
    where: { agentConfigurationId: { [Op.in]: configurationIds } },
  });

  if (githubConfigurations.length === 0) {
    return new Map();
  }

  const actionsByConfigurationId = githubConfigurations.reduce(
    (acc, config) => {
      const { agentConfigurationId, id, sId, name, description, actionType } =
        config;
      if (!acc.has(agentConfigurationId)) {
        acc.set(agentConfigurationId, []);
      }

      const actions = acc.get(agentConfigurationId);
      if (actions) {
        switch (actionType) {
          case "github_get_pull_request_action":
            actions.push({
              id,
              sId,
              type: "github_get_pull_request_configuration",
              name: name || DEFAULT_GITHUB_GET_PULL_REQUEST_ACTION_NAME,
              description,
            });
            break;
          default:
            assertNever(actionType);
        }
      }
      return acc;
    },
    new Map<ModelId, GithubGetPullRequestConfigurationType[]>()
  );

  return actionsByConfigurationId;
}
