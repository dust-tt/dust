import { Spinner } from "@dust-tt/sparkle";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeWebhookRequestTriggers } from "@app/poke/swr/webhook_request_triggers";
import type { LightWorkspaceType } from "@app/types/user";

import { makeColumnsForWebhookRequestTriggers } from "./columns";

export function WebhookRequestTriggersDataTable({
  owner,
  triggerId,
}: {
  owner: LightWorkspaceType;
  triggerId: string;
}) {
  const { data: webhookRequestTriggers, isLoading } =
    usePokeWebhookRequestTriggers({
      owner,
      triggerId,
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const columns = makeColumnsForWebhookRequestTriggers();
  return <PokeDataTable columns={columns} data={webhookRequestTriggers} />;
}
