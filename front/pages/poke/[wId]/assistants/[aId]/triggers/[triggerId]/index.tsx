import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ConversationDataTable } from "@app/components/poke/conversation/table";
import PokeLayout from "@app/components/poke/PokeLayout";
import { ViewTriggerTable } from "@app/components/poke/triggers/view";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type {
  ConversationWithoutContentType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  WorkspaceType,
} from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

export const getServerSideProps = withSuperUserAuthRequirements<{
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  owner: LightWorkspaceType;
  conversations: ConversationWithoutContentType[];
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { aId, triggerId } = context.params || {};
  if (typeof aId !== "string" || typeof triggerId !== "string") {
    return {
      notFound: true,
    };
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });
  if (!agentConfiguration) {
    return {
      notFound: true,
    };
  }

  const trigger = await TriggerResource.fetchById(auth, triggerId);
  if (!trigger || trigger.agentConfigurationId !== agentConfiguration.sId) {
    return {
      notFound: true,
    };
  }

  const conversations = await ConversationResource.listConversationsForTrigger(
    auth,
    triggerId
  );

  return {
    props: {
      trigger: trigger.toJSON(),
      agent: agentConfiguration,
      owner,
      conversations,
    },
  };
});

export default function TriggerPage({
  trigger,
  agent,
  owner,
  conversations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-col gap-y-6">
      <ViewTriggerTable trigger={trigger} agent={agent} owner={owner} />
      <div className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-semibold">Conversations</h2>
        <ConversationDataTable owner={owner} conversations={conversations} />
      </div>
    </div>
  );
}

TriggerPage.getLayout = (
  page: ReactElement,
  {
    owner,
    agent,
    trigger,
  }: {
    owner: WorkspaceType;
    agent: LightAgentConfigurationType;
    trigger: TriggerType;
    conversations: ConversationWithoutContentType[];
  }
) => {
  return (
    <PokeLayout title={`${owner.name} - ${agent.name} - ${trigger.name}`}>
      {page}
    </PokeLayout>
  );
};
