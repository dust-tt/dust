import { ZendeskTagFilters } from "@app/components/data_source/ZendeskTagFilters";
import { useZendeskOrganizationTagFilters } from "@app/hooks/useZendeskOrganizationTagFilters";
import type { DataSourceType, WorkspaceType } from "@app/types";

export function ZendeskOrganizationTagFilters({
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
  const {
    organizationTagFilters,
    addOrganizationTag,
    removeOrganizationTag,
    loading,
  } = useZendeskOrganizationTagFilters({ owner, dataSource });

  return (
    <ZendeskTagFilters
      readOnly={readOnly}
      isAdmin={isAdmin}
      title="Organization Tag Filters"
      description={
        "Configure organization tags to control which tickets are synced based on their " +
        "associated organization. Add 'Included' tags to sync only tickets from organizations with " +
        "those tags, or add 'Excluded' tags to filter out tickets from organizations with specific " +
        "tags. These filters only apply to future syncing and will not retroactively remove " +
        "already-synced tickets."
      }
      tagFilters={organizationTagFilters}
      addTag={addOrganizationTag}
      removeTag={removeOrganizationTag}
      loading={loading}
      placeholder="Enter tag name"
    />
  );
}
