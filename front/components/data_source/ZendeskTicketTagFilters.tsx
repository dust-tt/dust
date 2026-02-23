import { ZendeskTagFilters } from "@app/components/data_source/ZendeskTagFilters";
import { useZendeskTicketTagFilters } from "@app/hooks/useZendeskTicketTagFilters";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";

export function ZendeskTicketTagFilters({
  owner,
  readOnly,
  isAdmin,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  isAdmin: boolean;
  dataSource: DataSourceType;
}) {
  const { ticketTagFilters, addTicketTag, removeTicketTag, loading } =
    useZendeskTicketTagFilters({ owner, dataSource });

  return (
    <ZendeskTagFilters
      readOnly={readOnly}
      isAdmin={isAdmin}
      title="Ticket Tag Filters"
      description={
        "Include or exclude tickets from the sync based on their tags. " +
        "These filters only apply to future syncing and will not retroactively remove " +
        "already-synced tickets."
      }
      tagFilters={ticketTagFilters}
      addTag={addTicketTag}
      removeTag={removeTicketTag}
      loading={loading}
      placeholder="Enter tag name"
    />
  );
}
