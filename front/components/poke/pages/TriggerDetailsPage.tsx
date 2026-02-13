import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

import { ConversationDataTable } from "@app/components/poke/conversation/table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { PokeRecentWebhookRequests } from "@app/components/poke/triggers/RecentWebhookRequests";
import { ViewTriggerTable } from "@app/components/poke/triggers/view";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeTriggerDetails } from "@app/poke/swr/trigger_details";

export function TriggerDetailsPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Trigger`);

  const triggerId = useRequiredPathParam("triggerId");
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
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>
      <div className="flex flex-row gap-x-6">
        <ViewTriggerTable
          trigger={trigger}
          agent={agent}
          owner={owner}
          editorUser={editorUser}
        />
        <div className="mt-4 flex grow flex-col gap-4">
          <PluginList
            pluginResourceTarget={{
              resourceType: "triggers",
              resourceId: trigger.sId,
              workspace: owner,
            }}
          />
          {trigger.kind === "webhook" && (
            <>
              <PokeRecentWebhookRequests
                owner={owner}
                triggerId={trigger.sId}
              />
            </>
          )}
          <ConversationDataTable owner={owner} trigger={trigger} />
        </div>
      </div>
    </>
  );
}
