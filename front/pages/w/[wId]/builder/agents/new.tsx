import { Spinner } from "@dust-tt/sparkle";
import Head from "next/head";
import { useRouter } from "next/router";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import type { BuilderFlow } from "@app/components/agent_builder/types";
import { BUILDER_FLOWS } from "@app/components/agent_builder/types";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import {
  useAgentConfiguration,
  useAssistantTemplate,
} from "@app/lib/swr/assistants";
import {
  useFeatureFlags,
  useWorkspaceAuthContext,
} from "@app/lib/swr/workspaces";
import Custom404 from "@app/pages/404";
import type {
  AgentConfigurationScope,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isBuilder, isString } from "@app/types";

function isBuilderFlow(value: string): value is BuilderFlow {
  return BUILDER_FLOWS.some((flow) => flow === value);
}

function resolveBuilderFlow(value: unknown): BuilderFlow {
  if (isString(value) && isBuilderFlow(value)) {
    return value;
  }
  return "personal_assistants";
}

function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function CreateAgentPage() {
  const { isReady, query } = useRouter();

  if (!isReady) {
    return null;
  }

  if (!isString(query.wId)) {
    return <Custom404 />;
  }

  return <CreateAgentAuthGate workspaceId={query.wId} />;
}

interface CreateAgentAuthGateProps {
  workspaceId: string;
}

function CreateAgentAuthGate({ workspaceId }: CreateAgentAuthGateProps) {
  const {
    owner,
    user,
    subscription,
    isAdmin,
    isAuthContextLoading,
    isAuthContextError,
  } = useWorkspaceAuthContext({ workspaceId });

  if (isAuthContextLoading) {
    return <FullPageSpinner />;
  }

  if (isAuthContextError || !owner || !subscription || !user) {
    return <Custom404 />;
  }

  return (
    <CreateAgentFeatureGate owner={owner} user={user} isAdmin={isAdmin} />
  );
}

interface CreateAgentFeatureGateProps {
  owner: WorkspaceType;
  user: UserType;
  isAdmin: boolean;
}

function CreateAgentFeatureGate({
  owner,
  user,
  isAdmin,
}: CreateAgentFeatureGateProps) {
  const { featureFlags, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  if (isFeatureFlagsLoading) {
    return <FullPageSpinner />;
  }

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

  if (isRestrictedFromAgentCreation) {
    return <Custom404 />;
  }

  return (
    <CreateAgentContent owner={owner} user={user} isAdmin={isAdmin} />
  );
}

interface CreateAgentContentProps {
  owner: WorkspaceType;
  user: UserType;
  isAdmin: boolean;
}

function CreateAgentContent({
  owner,
  user,
  isAdmin,
}: CreateAgentContentProps) {
  const router = useRouter();
  const templateId = isString(router.query.templateId)
    ? router.query.templateId
    : null;
  const duplicateAgentId = isString(router.query.duplicate)
    ? router.query.duplicate
    : null;

  const flow = resolveBuilderFlow(router.query.flow);

  const {
    assistantTemplate,
    isAssistantTemplateLoading,
    isAssistantTemplateError,
  } = useAssistantTemplate({ templateId });

  const {
    agentConfiguration: duplicateAgentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: duplicateAgentId,
  });

  const scope: AgentConfigurationScope =
    flow === "personal_assistants" ? "hidden" : "visible";

  const agentConfiguration = duplicateAgentConfiguration
    ? {
        ...duplicateAgentConfiguration,
        scope,
      }
    : null;

  if (duplicateAgentId) {
    if (isAgentConfigurationLoading) {
      return <FullPageSpinner />;
    }

    if (isAgentConfigurationError || !duplicateAgentConfiguration) {
      return <Custom404 />;
    }
  }

  if (templateId) {
    if (isAssistantTemplateLoading) {
      return <FullPageSpinner />;
    }

    if (isAssistantTemplateError || !assistantTemplate) {
      return <Custom404 />;
    }
  }

  if (agentConfiguration) {
    throwIfInvalidAgentConfiguration(agentConfiguration);
  }

  return (
    <AgentBuilderProvider
      owner={owner}
      user={user}
      isAdmin={isAdmin}
      assistantTemplate={assistantTemplate}
    >
      <Head>
        <title>Dust - New Agent</title>
      </Head>
      <AgentBuilder
        agentConfiguration={agentConfiguration ?? undefined}
        duplicateAgentId={duplicateAgentId}
      />
    </AgentBuilderProvider>
  );
}

CreateAgentPage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
