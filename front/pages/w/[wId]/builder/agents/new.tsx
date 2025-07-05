import type { InferGetServerSidePropsType } from "next";
import type { ParsedUrlQuery } from "querystring";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import { DataSourceViewsProvider } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { MCPServerViewsProvider } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import { SpacesProvider } from "@app/components/assistant_builder/contexts/SpacesContext";
import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { generateMockAgentConfigurationFromTemplate } from "@app/lib/api/assistant/templates";
import config from "@app/lib/api/config";
import { getFeatureFlags, isRestrictedFromAgentCreation } from "@app/lib/auth";
import { AuthenticatorProvider } from "@app/lib/context/authenticator";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAssistantTemplate } from "@app/lib/swr/assistants";
import type {
  AgentConfigurationType,
  PlanType,
  SubscriptionType,
  TemplateAgentConfigurationType,
  UserType,
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
  user: UserType;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  agentConfiguration:
    | AgentConfigurationType
    | TemplateAgentConfigurationType
    | null;
  flow: BuilderFlow;
  baseUrl: string;
  templateId: string | null;
  isAdmin: boolean;
}>(async (context, auth) => {
  const user = auth.user();
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (!owner || !plan || !auth.isUser() || !subscription || !user) {
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

  if (await isRestrictedFromAgentCreation(owner)) {
    return {
      notFound: true,
    };
  }

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

  return {
    props: {
      agentConfiguration: configuration,
      baseUrl: config.getClientFacingUrl(),
      flow,
      user: user.toJSON(),
      owner,
      plan,
      subscription,
      isAdmin: auth.isAdmin(),
      templateId,
    },
  };
});

export default function CreateAgent({
  agentConfiguration,
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
    <AgentBuilderProvider owner={owner}>
      <SpacesProvider owner={owner}>
        <MCPServerViewsProvider owner={owner}>
          <DataSourceViewsProvider owner={owner}>
            <AgentBuilder />
          </DataSourceViewsProvider>
        </MCPServerViewsProvider>
      </SpacesProvider>
    </AgentBuilderProvider>
  );
}

CreateAgent.getLayout = (
  page: React.ReactElement,
  pageProps: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
  return (
    <AppRootLayout>
      <AuthenticatorProvider value={pageProps}>{page}</AuthenticatorProvider>
    </AppRootLayout>
  );
};
