import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeWebhookSources } from "@app/poke/swr/webhook_sources";
import type { LightWorkspaceType } from "@app/types/user";

import { makeColumnsForWebhookSources } from "./columns";

export function WebhookSourceDataTable({
  owner,
  loadOnInit,
}: {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}) {
  return (
    <PokeDataTableConditionalFetch
      header="Webhook Sources"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeWebhookSources}
    >
      {(webhookSources) => {
        const columns = makeColumnsForWebhookSources(owner);
        return <PokeDataTable columns={columns} data={webhookSources} />;
      }}
    </PokeDataTableConditionalFetch>
  );
}
