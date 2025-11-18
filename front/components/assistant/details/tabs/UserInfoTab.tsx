import { Page } from "@dust-tt/sparkle";

import type { GetMemberResponseBody } from "@app/pages/api/w/[wId]/members/[uId]";
import type { WorkspaceType } from "@app/types";

interface UserInfoTabProps {
  userDetails: GetMemberResponseBody["member"] | undefined;
  owner: WorkspaceType;
}

export function UserInfoTab({ userDetails, owner: _owner }: UserInfoTabProps) {
  if (!userDetails) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <Page.SectionHeader
        title="User information"
        description="Details about this workspace member."
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">
            Username
          </div>
          <div className="text-sm text-foreground dark:text-foreground-night">
            {userDetails.username}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">Email</div>
          <div className="text-sm text-foreground dark:text-foreground-night">
            {userDetails.email}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">Name</div>
          <div className="text-sm text-foreground dark:text-foreground-night">
            {userDetails.fullName}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">Role</div>
          <div className="text-sm text-foreground dark:text-foreground-night">
            {userDetails.role}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="text-xs font-medium text-muted-foreground">
            Status
          </div>
          <div className="text-sm text-foreground dark:text-foreground-night">
            {userDetails.revoked ? "Revoked" : "Active"}
          </div>
        </div>
      </div>
    </div>
  );
}
