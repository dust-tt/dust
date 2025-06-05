import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import {
  buildInitialActions,
  getAccessibleSourcesAndApps,
} from "@app/components/assistant_builder/server_side_props_helpers";
import type {
  AssistantBuilderInitialState,
  BuilderFlow,
} from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { generateMockAgentConfigurationFromTemplate } from "@app/lib/api/assistant/templates";
import config from "@app/lib/api/config";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getFeatureFlags } from "@app/lib/auth";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAssistantTemplate } from "@app/lib/swr/assistants";
import type {
  AgentConfigurationType,
  AppType,
  DataSourceViewType,
  PlanType,
  SpaceType,
  SubscriptionType,
  TemplateAgentConfigurationType,
  WorkspaceType,
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
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !auth.isUser() || !subscription) {
    return {
      notFound: true,
    };
  }

  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("agent_builder_v2") || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  if (
    featureFlags.includes("restrict_agent_creation_to_higher_users") &&
    !auth.isBuilder() &&
    !auth.isAdmin()
  ) {
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
    configuration.scope = flow === "personal_assistants" ? "hidden" : "visible";
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
    },
  };
});

export default function CreateAgent({
  agentConfiguration,
  spaces,
  dataSourceViews,
  dustApps,
  mcpServerViews,
  owner,
  templateId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { assistantTemplate } = useAssistantTemplate({ templateId });

  if (agentConfiguration) {
    throwIfInvalidAgentConfiguration(agentConfiguration);
  }

  if (templateId && !assistantTemplate) {
    return null;
  }

  return (
    <AgentBuilderProvider
      spaces={spaces}
      dustApps={dustApps}
      dataSourceViews={dataSourceViews}
      mcpServerViews={mcpServerViews}
    >
      <AgentBuilder owner={owner} />
    </AgentBuilderProvider>
  );
}

CreateAgent.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
