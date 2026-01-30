import { Spinner } from "@dust-tt/sparkle";
import Head from "next/head";
import { useRouter } from "next/router";
import type { ReactElement } from "react";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useWorkspaceAuthContext } from "@app/lib/swr/workspaces";
import type {
  LightAgentConfigurationType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isString } from "@app/types";

function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function EditAgentPage() {
  const router = useRouter();

  if (!router.isReady) {
    return null;
  }

  if (!isString(router.query.wId) || !isString(router.query.aId)) {
    void router.replace("/404");
    return <FullPageSpinner />;
  }

  return (
    <EditAgentAuthGate
      workspaceId={router.query.wId}
      agentId={router.query.aId}
    />
  );
}

interface EditAgentAuthGateProps {
  workspaceId: string;
  agentId: string;
}

function EditAgentAuthGate({ workspaceId, agentId }: EditAgentAuthGateProps) {
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
    <EditAgentLoader
      owner={owner}
      user={user}
      isAdmin={isAdmin}
      agentId={agentId}
    />
  );
}

interface EditAgentLoaderProps {
  owner: WorkspaceType;
  user: UserType;
  isAdmin: boolean;
  agentId: string;
}

function EditAgentLoader({
  owner,
  user,
  isAdmin,
  agentId,
}: EditAgentLoaderProps) {
  const router = useRouter();
  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
  });

  if (isAgentConfigurationLoading) {
    return <FullPageSpinner />;
  }

  if (isAgentConfigurationError || !agentConfiguration) {
    void router.replace("/404");
    return <FullPageSpinner />;
  }

  if (!agentConfiguration.canEdit && !isAdmin) {
    void router.replace("/404");
    return <FullPageSpinner />;
  }

  return (
    <EditAgentContent
      agentConfiguration={agentConfiguration}
      owner={owner}
      user={user}
      isAdmin={isAdmin}
    />
  );
}

interface EditAgentContentProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
  user: UserType;
  isAdmin: boolean;
}

function EditAgentContent({
  agentConfiguration,
  owner,
  user,
  isAdmin,
}: EditAgentContentProps) {
  if (agentConfiguration.scope === "global") {
    throw new Error("Cannot edit global agent");
  }

  if (agentConfiguration.status === "archived") {
    throw new Error("Cannot edit archived agent");
  }

  return (
    <AgentBuilderProvider
      owner={owner}
      user={user}
      isAdmin={isAdmin}
      assistantTemplate={null}
    >
      <Head>
        <title>{`Dust - @${agentConfiguration.name}`}</title>
      </Head>
      <AgentBuilder agentConfiguration={agentConfiguration} />
    </AgentBuilderProvider>
  );
}

function getLayout(page: ReactElement) {
  return <AppRootLayout>{page}</AppRootLayout>;
}

EditAgentPage.getLayout = getLayout;
