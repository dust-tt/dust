import { Spinner } from "@dust-tt/sparkle";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeWebhookRequests } from "@app/poke/swr/webhook_requests";
import type { LightWorkspaceType } from "@app/types/user";

import { makeColumnsForWebhookRequests } from "./columns";

export function WebhookRequestDataTable({
  owner,
  webhookSourceId,
}: {
  owner: LightWorkspaceType;
  webhookSourceId: string;
}) {
  const { data: webhookRequests, isLoading } = usePokeWebhookRequests({
    owner,
    webhookSourceId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const columns = makeColumnsForWebhookRequests(owner);
  return <PokeDataTable columns={columns} data={webhookRequests} />;
}
