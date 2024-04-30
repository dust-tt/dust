import type { InferGetServerSidePropsType } from "next";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import type { AssistantBuilderInitialState } from "@app/components/assistant_builder/types";
import { isDustAppRunConfiguration } from "@app/lib/api/assistant/actions/dust_app_run/types";
import { isRetrievalConfiguration } from "@app/lib/api/assistant/actions/retrieval/types";
import { deprecatedGetFirstActionConfiguration } from "@app/lib/deprecated_action_configurations";

import type { getServerSideProps } from ".";

export default function EditAssistant({
  owner,
  subscription,
  plan,
  gaTrackingId,
  dataSources,
  dustApps,
  retrievalConfiguration,
  dustAppConfiguration,
  tablesQueryConfiguration,
  processConfiguration,
  agentConfiguration,
  flow,
  baseUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let actionMode: AssistantBuilderInitialState["actionMode"] = "GENERIC";

  const action = deprecatedGetFirstActionConfiguration(agentConfiguration);

  if (isRetrievalConfiguration(action)) {
    if (action.query === "none") {
      if (
        action.relativeTimeFrame === "auto" ||
        action.relativeTimeFrame === "none"
      ) {
        /** Should never happen. Throw loudly if it does */
        throw new Error(
          "Invalid configuration: exhaustive retrieval must have a definite time frame"
        );
      }
      actionMode = "RETRIEVAL_EXHAUSTIVE";
    }
    if (action.query === "auto") {
      actionMode = "RETRIEVAL_SEARCH";
    }
  }

  if (isDustAppRunConfiguration(action)) {
    actionMode = "DUST_APP_RUN";
  }

  if (isTablesQueryConfiguration(action)) {
    actionMode = "TABLES_QUERY";
  }

  if (isProcessConfiguration(action)) {
    if (
      action.relativeTimeFrame === "auto" ||
      action.relativeTimeFrame === "none"
    ) {
      /** Should never happen as not permitted for now. */
      throw new Error(
        "Invalid configuration: process must have a definite time frame"
      );
    }
    actionMode = "PROCESS";
  }

  if (agentConfiguration.scope === "global") {
    throw new Error("Cannot edit global assistant");
  }

  return (
    <AssistantBuilder
      owner={owner}
      subscription={subscription}
      plan={plan}
      gaTrackingId={gaTrackingId}
      dataSources={dataSources}
      dustApps={dustApps}
      flow={flow}
      initialBuilderState={{
        actionMode,
        retrievalConfiguration,
        dustAppConfiguration,
        tablesQueryConfiguration,
        processConfiguration,
        scope: agentConfiguration.scope,
        handle: agentConfiguration.name,
        description: agentConfiguration.description,
        instructions: agentConfiguration.instructions || "", // TODO we don't support null in the UI yet
        avatarUrl: agentConfiguration.pictureUrl,
        generationSettings: {
          modelSettings: {
            modelId: agentConfiguration.model.modelId,
            providerId: agentConfiguration.model.providerId,
          },
          temperature: agentConfiguration.model.temperature,
        },
      }}
      agentConfigurationId={agentConfiguration.sId}
      baseUrl={baseUrl}
      defaultTemplate={null}
    />
  );
}
