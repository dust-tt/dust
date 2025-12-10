import { Card, Chip, cn, Page } from "@dust-tt/sparkle";
import type { ComponentProps, ReactNode } from "react";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import type { GetMemberResponseBody } from "@app/pages/api/w/[wId]/members/[uId]";
import type { RoleType, WorkspaceType } from "@app/types";

interface UserInfoTabProps {
  userDetails: GetMemberResponseBody["member"] | undefined;
  owner: WorkspaceType;
}

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

type InfoFieldProps = {
  label: string;
  value?: ReactNode;
  className?: string;
};

const SectionCard = ({ title, description, children }: SectionCardProps) => (
  <Card variant="secondary" size="lg" className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
        {title}
      </div>
      {description && (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </div>
      )}
    </div>
    {children}
  </Card>
);

const InfoField = ({ label, value, className }: InfoFieldProps) => (
  <div
    className={cn(
      "rounded-2xl bg-muted-background p-3 text-sm text-foreground dark:bg-muted-background-night dark:text-foreground-night",
      className
    )}
  >
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
      {label}
    </div>
    <div className="mt-1 text-sm text-foreground dark:text-foreground-night">
      {value ?? (
        <span className="text-muted-foreground dark:text-muted-foreground-night">
          —
        </span>
      )}
    </div>
  </div>
);

const formatTextValue = (value?: string | null) =>
  value && value.trim().length > 0 ? value : undefined;

type ChipColor = ComponentProps<typeof Chip>["color"];

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

const getRoleChipProps = (
  role: RoleType
): { label: string; color: ChipColor } => {
  if (role === "none") {
    return {
      label: "No access",
      color: "primary",
    };
  }

  return {
    label: capitalize(displayRole(role)),
    color: ROLES_DATA[role].color,
  };
};

export function UserInfoTab({ userDetails, owner: _owner }: UserInfoTabProps) {
  if (!userDetails) {
    return null;
  }

  const roleChip = getRoleChipProps(userDetails.role);

  return (
    <div className="flex flex-col gap-5">
      <Page.SectionHeader
        title="User information"
        description="Details about this workspace member."
      />

      <div className="flex flex-col gap-4">
        <SectionCard
          title="Profile"
          description="Identity and contact details that are visible to the workspace."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoField
              label="Username"
              value={formatTextValue(userDetails.username)}
            />
            <InfoField
              label="Email"
              value={formatTextValue(userDetails.email)}
            />
            <InfoField
              label="Full name"
              className="col-span-2"
              value={formatTextValue(userDetails.fullName)}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Workspace access"
          description="How this member can use Dust."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoField
              label="Role"
              value={
                <Chip size="xs" color={roleChip.color} label={roleChip.label} />
              }
            />

            <InfoField
              label="Status"
              value={
                <Chip
                  size="xs"
                  color={userDetails.revoked ? "rose" : "success"}
                  label={userDetails.revoked ? "Revoked" : "Active"}
                />
              }
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
