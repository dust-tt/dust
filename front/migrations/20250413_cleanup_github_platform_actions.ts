import {
  AgentGithubConfiguration,
  AgentGithubCreateIssueAction,
  AgentGithubGetPullRequestAction,
} from "@app/lib/models/assistant/actions/github";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { PlatformActionsConfigurationModel } from "@app/lib/resources/storage/models/platform_actions";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // Platform actions configurations
  const configurations = await PlatformActionsConfigurationModel.findAll({});
  logger.info(`Found ${configurations.length} platform actions configurations`);
  for (const configuration of configurations) {
    if (!execute) {
      logger.info(
        `[DRY] Removing plaform actions configuration ${configuration.id}`
      );
      continue;
    }
    logger.info(
      `[RUN] Removing plaform actions configuration ${configuration.id}`
    );
    await configuration.destroy();
  }

  // Feature flags
  const featureFlags = await FeatureFlag.findAll({
    where: {
      name: "labs_github_actions",
    },
  });
  logger.info(
    "Found ${featureFlags.length} `labs_github_actions` feature flags"
  );
  for (const featureFlag of featureFlags) {
    if (!execute) {
      logger.info(`[DRY] Removing feature flag ${featureFlag.id}`);
      continue;
    }
    logger.info(`[RUN] Removing feature flag ${featureFlag.id}`);
    await featureFlag.destroy();
  }

  // Agent Github configurations
  const actionConfigurations = await AgentGithubConfiguration.findAll({});
  logger.info(
    `Found ${actionConfigurations.length} agent github configurations`
  );
  for (const actionConfiguration of actionConfigurations) {
    if (!execute) {
      logger.info(
        `[DRY] Removing agent github configuration ${actionConfiguration.id}`
      );
      continue;
    }
    logger.info(
      `[RUN] Removing agent github configuration ${actionConfiguration.id}`
    );
    await actionConfiguration.destroy();
  }

  // Agent Github create issue actions
  const createIssueActions = await AgentGithubCreateIssueAction.findAll({});
  logger.info(
    `Found ${createIssueActions.length} agent github create issue actions`
  );
  for (const createIssueAction of createIssueActions) {
    if (!execute) {
      logger.info(
        `[DRY] Removing agent github create issue action ${createIssueAction.id}`
      );
      continue;
    }
    logger.info(
      `[RUN] Removing agent github create issue action ${createIssueAction.id}`
    );
    await createIssueAction.destroy();
  }

  // Agent Github Retrieve Pull Request actions
  const getPullRequestActions = await AgentGithubGetPullRequestAction.findAll(
    {}
  );
  logger.info(
    `Found ${getPullRequestActions.length} agent github retrieve pull request actions`
  );
  for (const getPullRequestAction of getPullRequestActions) {
    if (!execute) {
      logger.info(
        `[DRY] Removing agent github retrieve pull request action ${getPullRequestAction.id}`
      );
      continue;
    }
    logger.info(
      `[RUN] Removing agent github retrieve pull request action ${getPullRequestAction.id}`
    );
    await getPullRequestAction.destroy();
  }
});
