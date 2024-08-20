import type {
  AgentConfigurationType,
  AppType,
  DataSourceType,
  DataSourceViewType,
  PlanType,
  SubscriptionType,
  TemplateAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { throwIfInvalidAgentConfiguration } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { AssistantBuilderProvider } from "@app/components/assistant_builder/AssistantBuilderContext";
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
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
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
  dataSourceViews: DataSourceViewType[];
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

  const globalAndSystemVault = await VaultResource.listWorkspaceVaults(
    auth,
    true
  );

  const [ds, dsViews, allDustApps] = await Promise.all([
    DataSourceResource.listByVaults(auth, globalAndSystemVault),
    DataSourceViewResource.listByVaults(auth, globalAndSystemVault),
    getApps(auth),
  ]);

  const dataSourcesByName = ds.reduce(
    (acc, ds) => ({ ...acc, [ds.name]: ds }),
    {} as Record<string, DataSourceResource>
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
      dataSources: ds.map((ds) => ds.toJSON()),
      dataSourceViews: dsViews.map((dsView) => dsView.toJSON()),
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
  dataSourceViews,
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
    throwIfInvalidAgentConfiguration(agentConfiguration);
  }

  if (templateId && !assistantTemplate) {
    return null;
  }

  return (
    <AssistantBuilderProvider
      dustApps={dustApps}
      dataSources={dataSources}
      dataSourceViews={dataSourceViews}
    >
      <AssistantBuilder
        owner={owner}
        subscription={subscription}
        plan={plan}
        gaTrackingId={gaTrackingId}
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
    </AssistantBuilderProvider>
  );
}
