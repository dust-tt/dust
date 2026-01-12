import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ConversationDataTable } from "@app/components/poke/conversation/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { PokeRecentWebhookRequests } from "@app/components/poke/triggers/RecentWebhookRequests";
import { ViewTriggerTable } from "@app/components/poke/triggers/view";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
  UserType,
  WorkspaceType,
} from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

export const getServerSideProps = withSuperUserAuthRequirements<{
  trigger: TriggerType;
  agent: LightAgentConfigurationType;
  owner: LightWorkspaceType;
  editorUser: UserType | null;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

  // Fetch editor user
  const editorUsers = trigger.editor
    ? await UserResource.fetchByModelIds([trigger.editor])
    : [];
  const editorUser = editorUsers.length > 0 ? editorUsers[0].toJSON() : null;

  return {
    props: {
      trigger: trigger.toJSON(),
      agent: agentConfiguration,
      owner,
      editorUser,
    },
  };
});

export default function TriggerPage({
  trigger,
  agent,
  owner,
  editorUser,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <h3 className="text-xl font-bold">
        Trigger {trigger.name} on agent {agent.name}{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>
      <div className="flex flex-row gap-x-6">
        <ViewTriggerTable
          trigger={trigger}
          agent={agent}
          owner={owner}
          editorUser={editorUser}
        />
        <div className="mt-4 flex grow flex-col">
          <PluginList
            pluginResourceTarget={{
              resourceType: "triggers",
              resourceId: trigger.sId,
              workspace: owner,
            }}
          />
          {trigger.kind === "webhook" && (
            <PokeRecentWebhookRequests owner={owner} trigger={trigger} />
          )}
          {trigger.customPrompt && (
            <div className="border-material-200 my-4 flex min-h-24 flex-col rounded-lg border bg-muted-background dark:bg-muted-background-night">
              <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4 dark:bg-primary-300-night">
                <h2 className="text-md font-bold">Custom Prompt</h2>
              </div>
              <div className="flex flex-grow flex-col justify-center p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {trigger.customPrompt}
                </p>
              </div>
            </div>
          )}
          <ConversationDataTable owner={owner} trigger={trigger} />
        </div>
      </div>
    </>
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
  }
) => {
  return (
    <PokeLayout title={`${owner.name} - ${agent.name} - ${trigger.name}`}>
      {page}
    </PokeLayout>
  );
};
