import type {
  AgentConfigurationType,
  AppType,
  DataSourceType,
  PlanType,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isDatabaseQueryConfiguration,
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
} from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";

import type {
  AssistantBuilderInitialState,
  BuilderFlow,
} from "@app/components/assistant_builder/AssistantBuilder";
import AssistantBuilder, {
  BUILDER_FLOWS,
} from "@app/components/assistant_builder/AssistantBuilder";
import { getApps } from "@app/lib/api/app";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { buildInitialState } from "@app/pages/w/[wId]/builder/assistants/[aId]";

const { GA_TRACKING_ID = "" } = process.env;

type DataSourceConfig = NonNullable<
  AssistantBuilderInitialState["dataSourceConfigurations"]
>[string];

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dataSourceConfigurations: Record<string, DataSourceConfig> | null;
  dustApps: AppType[];
  dustAppConfiguration: AssistantBuilderInitialState["dustAppConfiguration"];
  databaseQueryConfiguration: AssistantBuilderInitialState["databaseQueryConfiguration"];
  agentConfiguration: AgentConfigurationType | null;
  flow: BuilderFlow;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !user || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const allDataSources = await getDataSources(auth);
  const allDustApps = await getApps(auth);

  const dataSourceByName = allDataSources.reduce(
    (acc, ds) => ({ ...acc, [ds.name]: ds }),
    {} as Record<string, DataSourceType>
  );

  let config: AgentConfigurationType | null = null;
  if (context.query.duplicate && typeof context.query.duplicate === "string") {
    config = await getAgentConfiguration(auth, context.query.duplicate);

    if (!config) {
      return {
        notFound: true,
      };
    }
  }

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  const {
    dataSourceConfigurations,
    dustAppConfiguration,
    databaseQueryConfiguration,
  } = config
    ? await buildInitialState({
        config,
        dataSourceByName,
        dustApps: allDustApps,
      })
    : {
        dataSourceConfigurations: null,
        dustAppConfiguration: null,
        databaseQueryConfiguration: null,
      };

  return {
    props: {
      user,
      owner,
      plan,
      subscription,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
      dataSourceConfigurations,
      dustApps: allDustApps,
      dustAppConfiguration,
      databaseQueryConfiguration: databaseQueryConfiguration,
      agentConfiguration: config,
      flow,
    },
  };
};

export default function CreateAssistant({
  user,
  owner,
  subscription,
  plan,
  gaTrackingId,
  dataSources,
  dataSourceConfigurations,
  dustApps,
  dustAppConfiguration,
  databaseQueryConfiguration,
  agentConfiguration,
  flow,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let actionMode: AssistantBuilderInitialState["actionMode"] = "GENERIC";

  let timeFrame: AssistantBuilderInitialState["timeFrame"] = null;

  if (agentConfiguration) {
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

    if (isDatabaseQueryConfiguration(agentConfiguration.action)) {
      actionMode = "DATABASE_QUERY";
    }
    if (agentConfiguration.scope === "global") {
      throw new Error("Cannot edit global assistant");
    }
  }

  return (
    <AssistantBuilder
      user={user}
      owner={owner}
      subscription={subscription}
      plan={plan}
      gaTrackingId={gaTrackingId}
      dataSources={dataSources}
      dustApps={dustApps}
      flow={flow}
      initialBuilderState={
        agentConfiguration
          ? {
              actionMode,
              timeFrame,
              dataSourceConfigurations,
              dustAppConfiguration,
              databaseQueryConfiguration,
              scope: "private",
              handle: `${agentConfiguration.name}_Copy`,
              description: agentConfiguration.description,
              instructions: agentConfiguration.generation?.prompt || "", // TODO we don't support null in the UI yet
              avatarUrl: null,
              generationSettings: agentConfiguration.generation
                ? {
                    modelSettings: agentConfiguration.generation.model,
                    temperature: agentConfiguration.generation.temperature,
                  }
                : null,
            }
          : null
      }
      agentConfigurationId={null}
      defaultIsEdited={true}
    />
  );
}
