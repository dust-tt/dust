import { ZendeskTagFilters } from "@app/components/data_source/ZendeskTagFilters";
import { useZendeskOrganizationTagFilters } from "@app/hooks/useZendeskOrganizationTagFilters";
import type { DataSourceType } from "@app/types/data_source";
import type { WorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
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
      title={t`Organization tag filters`}
      description={t`Include or exclude tickets from the sync based on their associated organization. These filters only apply to future syncing and will not retroactively remove already-synced tickets.`}
      tagFilters={organizationTagFilters}
      addTag={addOrganizationTag}
      removeTag={removeOrganizationTag}
      loading={loading}
      placeholder={t`Enter tag name`}
    />
  );
}
