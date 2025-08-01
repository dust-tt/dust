import { ZendeskTagFilters } from "@app/components/data_source/ZendeskTagFilters";
import { useZendeskTicketTagFilters } from "@app/hooks/useZendeskTicketTagFilters";
import type { DataSourceType, WorkspaceType } from "@app/types";

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
      description="Configure tags to control which tickets are synced to Dust. Include tags to sync only tickets with those tags, or exclude tags to filter out tickets with specific tags. These filters only apply to future syncing and will not retroactively remove already-synced tickets."
      tagFilters={ticketTagFilters}
      addTag={addTicketTag}
      removeTag={removeTicketTag}
      loading={loading}
      placeholder="Enter tag name"
    />
  );
}
