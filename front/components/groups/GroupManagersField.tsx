import { AddEditorDropdown } from "@app/components/members/AddEditorsDropdown";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Plus } from "@dust-tt/sparkle";

interface GroupManagersFieldProps {
  owner: LightWorkspaceType;
  group: GroupType;
  managers: SearchMemberType[];
  onChange: (managers: SearchMemberType[]) => void;
  disabled?: boolean;
}

export function GroupManagersField({
  owner,
  group,
  managers,
  onChange,
  disabled = false,
}: GroupManagersFieldProps) {
  const membershipDescription =
    group.kind === "provisioned"
      ? "Membership stays managed by your directory."
      : group.grantedRole === "admin"
        ? "Only workspace admins can change this group's members."
        : "They can add themselves or others, giving them any access, workspace role, permissions, or seats this group grants.";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Group managers</h3>
        <AddEditorDropdown
          owner={owner}
          editors={managers}
          onAddEditor={(manager) => onChange([...managers, manager])}
          trigger={
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              label="Add manager"
              disabled={disabled}
            />
          }
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Group managers can manage usage for this group's members.{" "}
        {membershipDescription}
      </p>
      {managers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No group managers yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {managers.map((manager) => (
            <div
              key={manager.sId}
              className="flex items-center justify-between"
            >
              <span className="truncate text-sm">
                {manager.fullName} ({manager.email})
              </span>
              <Button
                variant="ghost"
                size="sm"
                label="Remove"
                aria-label={`Remove ${manager.fullName} as group manager`}
                disabled={disabled}
                onClick={() =>
                  onChange(managers.filter((user) => user.sId !== manager.sId))
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
