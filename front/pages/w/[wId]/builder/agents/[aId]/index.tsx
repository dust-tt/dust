import { Spinner } from "@dust-tt/sparkle";
import Head from "next/head";
import type { ReactElement } from "react";

import AgentBuilder from "@app/components/agent_builder/AgentBuilder";
import { AgentBuilderProvider } from "@app/components/agent_builder/AgentBuilderContext";
import { AppAuthContextLayout } from "@app/components/sparkle/AppAuthContextLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter, useRequiredPathParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

export const getServerSideProps = appGetServerSideProps;

interface EditAgentProps {}

function EditAgent(_props: EditAgentProps) {
  const router = useAppRouter();
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  const agentId = useRequiredPathParam("aId");

  const {
    agentConfiguration,
    isAgentConfigurationLoading,
    isAgentConfigurationError,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentId,
  });

  if (
    isAgentConfigurationError ||
    (!isAgentConfigurationLoading && !agentConfiguration)
  ) {
    void router.replace("/404");
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (agentConfiguration && !agentConfiguration.canEdit && !isAdmin) {
    void router.replace("/404");
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isAgentConfigurationLoading || !agentConfiguration) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

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

const PageWithAuthLayout = EditAgent as AppPageWithLayout;

PageWithAuthLayout.getLayout = (
  page: ReactElement,
  pageProps: AuthContextValue
) => {
  return (
    <AppAuthContextLayout authContext={pageProps}>{page}</AppAuthContextLayout>
  );
};

export default PageWithAuthLayout;
