import type {
  AgentConfigurationType,
  AppType,
  DataSourceViewType,
  PlanType,
  PlatformActionsConfigurationType,
  SpaceType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { throwIfInvalidAgentConfiguration } from "@dust-tt/types";
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
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { PlatformActionsConfigurationResource } from "@app/lib/resources/platform_actions_configuration_resource";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  actions: AssistantBuilderInitialState["actions"];
  agentConfiguration: AgentConfigurationType;
  baseUrl: string;
  dataSourceViews: DataSourceViewType[];
  dustApps: AppType[];
  flow: BuilderFlow;
  owner: WorkspaceType;
  plan: PlanType;
  spaces: SpaceType[];
  subscription: SubscriptionType;
  platformActionsConfigurations: PlatformActionsConfigurationType[];
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

  const [
    { spaces, dataSourceViews, dustApps },
    configuration,
    platformActionsConfigurations,
  ] = await Promise.all([
    getAccessibleSourcesAndApps(auth),
    getAgentConfiguration(auth, context.params?.aId as string),
    PlatformActionsConfigurationResource.listByWorkspace(auth),
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

  return {
    props: {
      actions,
      agentConfiguration: configuration,
      baseUrl: config.getClientFacingUrl(),
      dataSourceViews: dataSourceViews.map((v) => v.toJSON()),
      dustApps: dustApps.map((a) => a.toJSON()),
      flow,
      owner,
      plan,
      subscription,
      spaces: spaces.map((s) => s.toJSON()),
      platformActionsConfigurations: platformActionsConfigurations.map((c) =>
        c.toJSON()
      ),
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
  flow,
  owner,
  plan,
  subscription,
  platformActionsConfigurations,
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
      platformActionsConfigurations={platformActionsConfigurations}
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
          },
          actions,
          visualizationEnabled: agentConfiguration.visualizationEnabled,
          maxStepsPerRun: agentConfiguration.maxStepsPerRun,
          templateId: agentConfiguration.templateId,
        }}
        agentConfigurationId={agentConfiguration.sId}
        baseUrl={baseUrl}
        defaultTemplate={null}
      />
    </AssistantBuilderProvider>
  );
}
