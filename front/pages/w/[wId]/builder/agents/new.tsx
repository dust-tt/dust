import { Spinner } from "@dust-tt/sparkle";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import type { BuilderFlow } from "@app/components/agent_builder/types";
import { BUILDER_FLOWS } from "@app/components/agent_builder/types";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { throwIfInvalidAgentConfiguration } from "@app/lib/actions/types/guards";
import { useRequiredPathParam, useSearchParam } from "@app/lib/platform";
import {
  useAgentConfiguration,
  useAssistantTemplate,
} from "@app/lib/swr/assistants";
import {
  useFeatureFlags,
  useWorkspaceAuthContext,
} from "@app/lib/swr/workspaces";
import type {
  AgentConfigurationScope,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isBuilder } from "@app/types";

function isBuilderFlow(value: string): value is BuilderFlow {
  return BUILDER_FLOWS.some((flow) => flow === value);
}

function resolveBuilderFlow(value: string | null): BuilderFlow {
  if (value && isBuilderFlow(value)) {
    return value;
  }
  return "personal_assistants";
}

function FullPageSpinner(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function CreateAgentPage(): JSX.Element {
  const workspaceId = useRequiredPathParam("wId");

  return <CreateAgentAuthGate workspaceId={workspaceId} />;
}

interface CreateAgentAuthGateProps {
  workspaceId: string;
}

function CreateAgentAuthGate({
  workspaceId,
}: CreateAgentAuthGateProps): JSX.Element {
  const router = useRouter();
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
    void router.replace("/404");
    return <FullPageSpinner />;
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
}: CreateAgentFeatureGateProps): JSX.Element {
  const router = useRouter();
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
    void router.replace("/404");
    return <FullPageSpinner />;
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
}: CreateAgentContentProps): JSX.Element {
  const router = useRouter();
  const templateId = useSearchParam("templateId");
  const duplicateAgentId = useSearchParam("duplicate");
  const flow = resolveBuilderFlow(useSearchParam("flow"));

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
      void router.replace("/404");
      return <FullPageSpinner />;
    }
  }

  if (templateId) {
    if (isAssistantTemplateLoading) {
      return <FullPageSpinner />;
    }

    if (isAssistantTemplateError || !assistantTemplate) {
      void router.replace("/404");
      return <FullPageSpinner />;
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

function getLayout(page: ReactElement): ReactElement {
  return <AppRootLayout>{page}</AppRootLayout>;
}

CreateAgentPage.getLayout = getLayout;
