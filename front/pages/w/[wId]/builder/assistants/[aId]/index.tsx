import type { InferGetServerSidePropsType } from "next";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { AssistantBuilderProvider } from "@app/components/assistant_builder/AssistantBuilderContext";
import {
  buildInitialActions,
  getAccessibleSourcesAndApps,
} from "@app/components/assistant_builder/server_side_props_helpers";
import type {
  AssistantBuilderInitialState,
  BuilderFlow,
} from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationType,
  AppType,
  DataSourceViewType,
  PlanType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@app/types";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  actions: AssistantBuilderInitialState["actions"];
  agentConfiguration: AgentConfigurationType;
  baseUrl: string;
  dataSourceViews: DataSourceViewType[];
  dustApps: AppType[];
  mcpServerViews: MCPServerViewType[];
  flow: BuilderFlow;
  owner: WorkspaceType;
  plan: PlanType;
  spaces: SpaceType[];
  subscription: SubscriptionType;
}>(async (context, auth) => {
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

  const [{ spaces, dataSourceViews, dustApps, mcpServerViews }, configuration] =
    await Promise.all([
      getAccessibleSourcesAndApps(auth),
      getAgentConfiguration(auth, context.params?.aId as string, "full"),
      MCPServerViewResource.ensureAllDefaultActionsAreCreated(auth),
    ]);

  if (configuration?.scope === "workspace" && !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  if (!configuration) {
    return {
      notFound: true,
    };
  }

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  const actions = await buildInitialActions({
    dataSourceViews,
    dustApps,
    configuration,
  });

  const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

  return {
    props: {
      actions,
      agentConfiguration: configuration,
      baseUrl: config.getClientFacingUrl(),
      dataSourceViews: dataSourceViews.map((v) => v.toJSON()),
      dustApps: dustApps.map((a) => a.toJSON()),
      mcpServerViews: mcpServerViewsJSON,
      flow,
      owner,
      plan,
      subscription,
      spaces: spaces.map((s) => s.toJSON()),
    },
  };
});

export default function EditAssistant({
  actions,
  agentConfiguration,
  baseUrl,
  spaces,
  dataSourceViews,
  dustApps,
  mcpServerViews,
  flow,
  owner,
  plan,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  throwIfInvalidAgentConfiguration(agentConfiguration);

  if (agentConfiguration.scope === "global") {
    throw new Error("Cannot edit global agent");
  }

  if (agentConfiguration.status === "archived") {
    throw new Error("Cannot edit archived agent");
  }

  return (
    <AssistantBuilderProvider
      spaces={spaces}
      dustApps={dustApps}
      dataSourceViews={dataSourceViews}
      mcpServerViews={mcpServerViews}
    >
      <AssistantBuilder
        owner={owner}
        subscription={subscription}
        plan={plan}
        flow={flow}
        initialBuilderState={{
          scope: agentConfiguration.scope,
          handle: agentConfiguration.name,
          description: agentConfiguration.description,
          instructions: agentConfiguration.instructions || "", // TODO we don't support null in the UI yet
          avatarUrl: agentConfiguration.pictureUrl,
          generationSettings: {
            modelSettings: {
              modelId: agentConfiguration.model.modelId,
              providerId: agentConfiguration.model.providerId,
              reasoningEffort: agentConfiguration.model.reasoningEffort,
            },
            temperature: agentConfiguration.model.temperature,
            responseFormat: agentConfiguration.model.responseFormat,
          },
          actions,
          visualizationEnabled: agentConfiguration.visualizationEnabled,
          maxStepsPerRun: agentConfiguration.maxStepsPerRun,
          templateId: agentConfiguration.templateId,
          tags: agentConfiguration.tags,
        }}
        agentConfigurationId={agentConfiguration.sId}
        baseUrl={baseUrl}
        defaultTemplate={null}
      />
    </AssistantBuilderProvider>
  );
}
