import type {
  AgentConfigurationType,
  AppType,
  DataSourceType,
  PlanType,
  SubscriptionType,
  TemplateAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isProcessConfiguration,
  isRetrievalConfiguration,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { buildInitialActions } from "@app/components/assistant_builder/server_side_props_helpers";
import type {
  AssistantBuilderInitialState,
  BuilderFlow,
} from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import { getApps } from "@app/lib/api/app";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { generateMockAgentConfigurationFromTemplate } from "@app/lib/api/assistant/templates";
import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAssistantTemplate } from "@app/lib/swr";

function getDuplicateAndTemplateIdFromQuery(query: ParsedUrlQuery) {
  const { duplicate, templateId } = query;

  return {
    duplicate: duplicate && typeof duplicate === "string" ? duplicate : null,
    templateId:
      templateId && typeof templateId === "string" ? templateId : null,
  };
}

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
  dustApps: AppType[];
  actions: AssistantBuilderInitialState["actions"];
  agentConfiguration:
    | AgentConfigurationType
    | TemplateAgentConfigurationType
    | null;
  flow: BuilderFlow;
  baseUrl: string;
  templateId: string | null;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const allDataSources = await getDataSources(auth);
  const allDustApps = await getApps(auth);

  const dataSourcesByName = allDataSources.reduce(
    (acc, ds) => ({ ...acc, [ds.name]: ds }),
    {} as Record<string, DataSourceType>
  );

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  let configuration:
    | AgentConfigurationType
    | TemplateAgentConfigurationType
    | null = null;
  const { duplicate, templateId } = getDuplicateAndTemplateIdFromQuery(
    context.query
  );
  if (duplicate) {
    configuration = await getAgentConfiguration(auth, duplicate);

    if (!configuration) {
      return {
        notFound: true,
      };
    }
  } else if (templateId) {
    const agentConfigRes = await generateMockAgentConfigurationFromTemplate(
      templateId,
      flow
    );

    if (agentConfigRes.isErr()) {
      return {
        notFound: true,
      };
    }

    configuration = agentConfigRes.value;
  }

  const actions = configuration
    ? await buildInitialActions({
        dataSourcesByName,
        dustApps: allDustApps,
        configuration,
      })
    : [];

  return {
    props: {
      owner,
      plan,
      subscription,
      gaTrackingId: config.getGaTrackingId(),
      dataSources: allDataSources,
      dustApps: allDustApps,
      actions,
      agentConfiguration: configuration,
      flow,
      baseUrl: config.getClientFacingUrl(),
      templateId,
    },
  };
});

export default function CreateAssistant({
  owner,
  subscription,
  plan,
  gaTrackingId,
  dataSources,
  dustApps,
  actions,
  agentConfiguration,
  flow,
  baseUrl,
  templateId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { assistantTemplate } = useAssistantTemplate({
    templateId,
    workspaceId: owner.sId,
  });

  if (agentConfiguration) {
    const actions = agentConfiguration.actions;
    actions.map((action) => {
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
        }
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
      }
    });
    if (agentConfiguration.scope === "global") {
      throw new Error("Cannot edit global assistant");
    }
  }

  if (templateId && !assistantTemplate) {
    return null;
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
      initialBuilderState={
        agentConfiguration
          ? {
              actions,
              scope:
                agentConfiguration.scope !== "global"
                  ? agentConfiguration.scope
                  : "private",
              handle: `${agentConfiguration.name}${
                "isTemplate" in agentConfiguration ? "" : "_Copy"
              }`,
              description: agentConfiguration.description,
              instructions: agentConfiguration.instructions || "", // TODO we don't support null in the UI yet
              avatarUrl:
                "pictureUrl" in agentConfiguration
                  ? agentConfiguration.pictureUrl
                  : null,
              generationSettings: {
                modelSettings: {
                  providerId: agentConfiguration.model.providerId,
                  modelId: agentConfiguration.model.modelId,
                },
                temperature: agentConfiguration.model.temperature,
              },
              maxStepsPerRun: agentConfiguration.maxStepsPerRun ?? null,
              visualizationEnabled: agentConfiguration.visualizationEnabled,
              templateId: templateId,
            }
          : null
      }
      agentConfigurationId={null}
      defaultIsEdited={true}
      baseUrl={baseUrl}
      defaultTemplate={assistantTemplate}
    />
  );
}
