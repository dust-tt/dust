import type {
  AgentConfigurationType,
  AppType,
  DataSourceViewType,
  PlanType,
  PlatformActionsConfigurationType,
  SpaceType,
  SubscriptionType,
  TemplateAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { throwIfInvalidAgentConfiguration } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";

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
import { generateMockAgentConfigurationFromTemplate } from "@app/lib/api/assistant/templates";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { PlatformActionsConfigurationResource } from "@app/lib/resources/platform_actions_configuration_resource";
import { useAssistantTemplate } from "@app/lib/swr/assistants";

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
  spaces: SpaceType[];
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
  platformActionsConfigurations: PlatformActionsConfigurationType[];
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const [{ spaces, dataSourceViews, dustApps }, platformActionsConfigurations] =
    await Promise.all([
      getAccessibleSourcesAndApps(auth),
      PlatformActionsConfigurationResource.listByWorkspace(auth),
    ]);

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
    // We reset the scope according to the current flow. This ensures that cloning a workspace
    // agent with flow `personal_assistants` will initialize the agent as private.
    configuration.scope =
      flow === "personal_assistants" ? "private" : "workspace";
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
        dataSourceViews,
        dustApps,
        configuration,
      })
    : [];

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
      templateId,
      spaces: spaces.map((s) => s.toJSON()),
      platformActionsConfigurations: platformActionsConfigurations.map((c) =>
        c.toJSON()
      ),
    },
  };
});

export default function CreateAssistant({
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
  templateId,
  platformActionsConfigurations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { assistantTemplate } = useAssistantTemplate({ templateId });

  if (agentConfiguration) {
    throwIfInvalidAgentConfiguration(agentConfiguration);
  }

  if (templateId && !assistantTemplate) {
    return null;
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
        defaultIsEdited={assistantTemplate !== null}
        baseUrl={baseUrl}
        defaultTemplate={assistantTemplate}
      />
    </AssistantBuilderProvider>
  );
}
