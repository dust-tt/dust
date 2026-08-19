import { makeColumnsForGroupPermissions } from "@app/components/poke/group_permissions/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeGroupPermissions } from "@app/poke/swr/group_permissions";
import type { GroupPermissionResourceType } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

interface GroupPermissionsDataTableProps {
  owner: LightWorkspaceType;
  // Pass either a groupId (grants held by that group) or a resourceType +
  // resourceId (grants that apply to that resource instance).
  groupId?: string;
  resourceType?: GroupPermissionResourceType;
  resourceId?: number;
}

export function GroupPermissionsDataTable({
  owner,
  groupId,
  resourceType,
  resourceId,
}: GroupPermissionsDataTableProps) {
  const { data, isLoading, isError } = usePokeGroupPermissions({
    owner,
    groupId,
    resourceType,
    resourceId,
  });

  let content;
  if (isLoading) {
    content = (
      <div className="flex h-32 items-center justify-center">
        <Spinner />
      </div>
    );
  } else if (isError) {
    content = (
      <div className="flex h-32 items-center justify-center">
        <p>Error loading group permissions.</p>
      </div>
    );
  } else {
    content = (
      <PokeDataTable
        columns={makeColumnsForGroupPermissions(owner)}
        data={data}
      />
    );
  }

  return (
    <div className="border-material-200 my-4 flex min-h-24 flex-col rounded-lg border bg-muted-background">
      <div className="flex justify-between gap-3 rounded-t-lg bg-primary-300 p-4">
        <h2 className="text-md font-bold">Group Permissions</h2>
      </div>
      <div className="flex flex-grow flex-col justify-center p-4">
        {content}
      </div>
    </div>
  );
}
