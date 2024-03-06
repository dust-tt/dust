import type {
  AgentConfigurationType,
  AppType,
  DataSourceType,
  PlanType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import type { BuilderFlow } from "@app/components/assistant_builder/AssistantBuilder";
import AssistantBuilder, {
  BUILDER_FLOWS,
} from "@app/components/assistant_builder/AssistantBuilder";
import { buildInitialState } from "@app/components/assistant_builder/server_side_props_helpers";
import type {
  AssistantBuilderDataSourceConfiguration,
  AssistantBuilderInitialState,
} from "@app/components/assistant_builder/types";
import { getApps } from "@app/lib/api/app";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator } from "@app/lib/auth";
import { withDefaultGetServerSidePropsRequirements } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "", URL = "" } = process.env;

export const getServerSideProps = withDefaultGetServerSidePropsRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dataSourceConfigurations: Record<
    string,
    AssistantBuilderDataSourceConfiguration
  >;
  dustApps: AppType[];
  dustAppConfiguration: AssistantBuilderInitialState["dustAppConfiguration"];
  tablesQueryConfiguration: AssistantBuilderInitialState["tablesQueryConfiguration"];
  agentConfiguration: AgentConfigurationType;
  flow: BuilderFlow;
  baseUrl: string;
}>(async (context, session) => {
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (
    !owner ||
    !plan ||
    !subscription ||
    !auth.isUser() ||
    !context.params?.aId
  ) {
    return {
      notFound: true,
    };
  }

  const allDataSources = await getDataSources(auth);

  const dataSourceByName = allDataSources.reduce(
    (acc, ds) => ({ ...acc, [ds.name]: ds }),
    {} as Record<string, DataSourceType>
  );
  const config = await getAgentConfiguration(
    auth,
    context.params?.aId as string
  );
  if (config?.scope === "workspace" && !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  if (!config) {
    return {
      notFound: true,
    };
  }

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  const allDustApps = await getApps(auth);

  const {
    dataSourceConfigurations,
    dustAppConfiguration,
    tablesQueryConfiguration,
  } = await buildInitialState({
    config,
    dataSourceByName,
    dustApps: allDustApps,
  });

  return {
    props: {
      owner,
      plan,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
      dataSourceConfigurations,
      dustApps: allDustApps,
      dustAppConfiguration,
      tablesQueryConfiguration,
      agentConfiguration: config,
      flow,
      baseUrl: URL,
    },
  };
});

export default function EditAssistant({
  owner,
  subscription,
  plan,
  gaTrackingId,
  dataSources,
  dataSourceConfigurations,
  dustApps,
  dustAppConfiguration,
  tablesQueryConfiguration,
  agentConfiguration,
  flow,
  baseUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let actionMode: AssistantBuilderInitialState["actionMode"] = "GENERIC";

  let timeFrame: AssistantBuilderInitialState["timeFrame"] = null;

  if (isRetrievalConfiguration(agentConfiguration.action)) {
    if (agentConfiguration.action.query === "none") {
      if (
        agentConfiguration.action.relativeTimeFrame === "auto" ||
        agentConfiguration.action.relativeTimeFrame === "none"
      ) {
        /** Should never happen. Throw loudly if it does */
        throw new Error(
          "Invalid configuration: exhaustive retrieval must have a definite time frame"
        );
      }
      actionMode = "RETRIEVAL_EXHAUSTIVE";
      timeFrame = {
        value: agentConfiguration.action.relativeTimeFrame.duration,
        unit: agentConfiguration.action.relativeTimeFrame.unit,
      };
    }
    if (agentConfiguration.action.query === "auto") {
      actionMode = "RETRIEVAL_SEARCH";
    }
  }

  if (isDustAppRunConfiguration(agentConfiguration.action)) {
    actionMode = "DUST_APP_RUN";
  }

  if (isTablesQueryConfiguration(agentConfiguration.action)) {
    actionMode = "TABLES_QUERY";
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
        timeFrame,
        dataSourceConfigurations,
        dustAppConfiguration,
        tablesQueryConfiguration,
        scope: agentConfiguration.scope,
        handle: agentConfiguration.name,
        description: agentConfiguration.description,
        instructions: agentConfiguration.generation?.prompt || "", // TODO we don't support null in the UI yet
        avatarUrl: agentConfiguration.pictureUrl,
        generationSettings: agentConfiguration.generation
          ? {
              modelSettings: agentConfiguration.generation.model,
              temperature: agentConfiguration.generation.temperature,
            }
          : null,
      }}
      agentConfigurationId={agentConfiguration.sId}
      baseUrl={baseUrl}
    />
  );
}
