import _ from "lodash";
import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";
import { useMemo } from "react";

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
import { generateMockAgentConfigurationFromTemplate } from "@app/lib/api/assistant/templates";
import config from "@app/lib/api/config";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAssistantTemplate } from "@app/lib/swr/assistants";
import { useEditors } from "@app/lib/swr/editors";
import {
  isTemplateAgentConfiguration,
  type AgentConfigurationType,
  type AppType,
  type DataSourceViewType,
  type PlanType,
  type SpaceType,
  type SubscriptionType,
  type TemplateAgentConfigurationType,
  type UserType,
  type WorkspaceType,
} from "@app/types";

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
  mcpServerViews: MCPServerViewType[];
  actions: AssistantBuilderInitialState["actions"];
  agentConfiguration:
    | AgentConfigurationType
    | TemplateAgentConfigurationType
    | null;
  flow: BuilderFlow;
  baseUrl: string;
  templateId: string | null;
  isAgentDiscoveryEnabled: boolean;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const { spaces, dataSourceViews, dustApps, mcpServerViews } =
    await getAccessibleSourcesAndApps(auth);

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  const featureFlag = await getFeatureFlags(owner);
  const isAgentDiscoveryEnabled = featureFlag.includes("agent_discovery");

  let configuration:
    | AgentConfigurationType
    | TemplateAgentConfigurationType
    | null = null;
  const { duplicate, templateId } = getDuplicateAndTemplateIdFromQuery(
    context.query
  );
  if (duplicate) {
    configuration = await getAgentConfiguration(auth, duplicate, "full");

    if (!configuration) {
      return {
        notFound: true,
      };
    }
    // We reset the scope according to the current flow. This ensures that cloning a workspace
    // agent with flow `personal_assistants` will initialize the agent as private.
    configuration.scope = isAgentDiscoveryEnabled
      ? flow === "personal_assistants"
        ? "hidden"
        : "visible"
      : flow === "personal_assistants"
        ? "private"
        : "workspace";
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
      templateId,
      spaces: spaces.map((s) => s.toJSON()),
      isAgentDiscoveryEnabled,
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
  mcpServerViews,
  flow,
  owner,
  plan,
  subscription,
  templateId,
  isAgentDiscoveryEnabled,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { assistantTemplate } = useAssistantTemplate({ templateId });
  const { editors } = useEditors({
    owner,
    agentConfigurationId:
      agentConfiguration && !isTemplateAgentConfiguration(agentConfiguration)
        ? agentConfiguration.sId
        : null,
  });

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
      mcpServerViews={mcpServerViews}
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
                    : isAgentDiscoveryEnabled
                      ? "hidden"
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
                  responseFormat: agentConfiguration.model.responseFormat,
                },
                maxStepsPerRun: agentConfiguration.maxStepsPerRun ?? null,
                visualizationEnabled: agentConfiguration.visualizationEnabled,
                templateId: templateId,
                tags: agentConfiguration.tags,
                editors,
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
