import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeWebhookSourceViews } from "@app/poke/swr/webhook_source_views";
import type { LightWorkspaceType } from "@app/types/user";

import { makeColumnsForWebhookSourceViews } from "./columns";

export function WebhookSourceViewDataTable({
  owner,
  loadOnInit,
}: {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}) {
  return (
    <PokeDataTableConditionalFetch
      header="Webhook Source Views"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeWebhookSourceViews}
    >
      {(webhookSourceViews) => {
        const columns = makeColumnsForWebhookSourceViews(owner);
        return <PokeDataTable columns={columns} data={webhookSourceViews} />;
      }}
    </PokeDataTableConditionalFetch>
  );
}
