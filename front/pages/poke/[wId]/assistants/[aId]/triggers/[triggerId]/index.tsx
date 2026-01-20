import { Spinner } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import { ConversationDataTable } from "@app/components/poke/conversation/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import PokeLayout from "@app/components/poke/PokeLayout";
import { PokeRecentWebhookRequests } from "@app/components/poke/triggers/RecentWebhookRequests";
import { ViewTriggerTable } from "@app/components/poke/triggers/view";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { usePokeTriggerDetails } from "@app/poke/swr/trigger_details";
import type { LightWorkspaceType, WorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  params: { wId: string; aId: string; triggerId: string };
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, aId, triggerId } = context.params ?? {};
  if (!isString(wId) || !isString(aId) || !isString(triggerId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      params: { wId, aId, triggerId },
    },
  };
});

export default function TriggerPage({
  owner,
  params,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { triggerId } = params;

  const {
    data: triggerDetails,
    isLoading,
    isError,
  } = usePokeTriggerDetails({
    owner,
    triggerId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !triggerDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading trigger details.</p>
      </div>
    );
  }

  const { trigger, agent, editorUser } = triggerDetails;

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
  { owner }: { owner: WorkspaceType }
) => {
  return <PokeLayout title={`${owner.name} - Trigger`}>{page}</PokeLayout>;
};
