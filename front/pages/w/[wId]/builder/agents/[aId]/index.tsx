import { Spinner } from "@dust-tt/sparkle";
import Head from "next/head";
import { useRouter } from "next/router";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { useWorkspaceAuthContext } from "@app/lib/swr/workspaces";
import Custom404 from "@app/pages/404";
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
  const { isReady, query } = useRouter();

  if (!isReady) {
    return null;
  }

  if (!isString(query.wId) || !isString(query.aId)) {
    return <Custom404 />;
  }

  return (
    <EditAgentAuthGate workspaceId={query.wId} agentId={query.aId} />
  );
}

interface EditAgentAuthGateProps {
  workspaceId: string;
  agentId: string;
}

function EditAgentAuthGate({ workspaceId, agentId }: EditAgentAuthGateProps) {
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
    return <Custom404 />;
  }

  if (!agentConfiguration.canEdit && !isAdmin) {
    return <Custom404 />;
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

EditAgentPage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
