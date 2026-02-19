import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForWebhookSources } from "@app/components/poke/webhook_sources/columns";
import { usePokeWebhookSources } from "@app/poke/swr/webhook_sources";
import type { LightWorkspaceType } from "@app/types/user";

interface WebhookSourceDataTableProps {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}

export function WebhookSourceDataTable({
  owner,
  loadOnInit,
}: WebhookSourceDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Webhook Sources"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeWebhookSources}
    >
      {(data) => (
        <PokeDataTable
          columns={makeColumnsForWebhookSources(owner)}
          data={data}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
