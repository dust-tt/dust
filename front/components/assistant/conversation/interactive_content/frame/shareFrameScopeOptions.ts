import type { FileShareScope } from "@app/types/files";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import { Globe01, Lock01, Users01 } from "@dust-tt/sparkle";

interface ScopeOption {
  icon: typeof Lock01;
  label: string;
  value: FileShareScope;
}

interface AvailableScopeOption extends ScopeOption {
  disabled: boolean;
}

export const SHARE_SCOPE_ICONS: Record<FileShareScope, typeof Lock01> = {
  emails_only: Lock01,
  workspace_and_emails: Users01,
  workspace: Users01,
  public: Globe01,
};

// Scopes allowed by each workspace sharing policy.
const ALLOWED_SCOPES_BY_POLICY: Record<
  WorkspaceSharingPolicy,
  FileShareScope[]
> = {
  workspace_only: ["emails_only", "workspace_and_emails"],
  workspace_and_emails: ["emails_only", "workspace_and_emails"],
  all_scopes: ["emails_only", "workspace_and_emails", "public"],
};

function getScopeOptions(canInviteExternal: boolean): ScopeOption[] {
  return [
    {
      icon: SHARE_SCOPE_ICONS.emails_only,
      label: canInviteExternal
        ? "Invite only"
        : "Invited workspace members only",
      value: "emails_only",
    },
    {
      icon: SHARE_SCOPE_ICONS.workspace_and_emails,
      label: canInviteExternal
        ? "All workspace members + invites"
        : "All workspace members",
      value: "workspace_and_emails",
    },
    {
      icon: SHARE_SCOPE_ICONS.public,
      label: "Anyone with the link",
      value: "public",
    },
  ];
}

interface GetAvailableScopeOptionsParams {
  sharingPolicy: WorkspaceSharingPolicy;
  canInviteExternal: boolean;
  canPublish: boolean;
  currentScope: FileShareScope;
}

export function getAvailableScopeOptions({
  sharingPolicy,
  canInviteExternal,
  canPublish,
  currentScope,
}: GetAvailableScopeOptionsParams): AvailableScopeOption[] {
  const allowedScopes = ALLOWED_SCOPES_BY_POLICY[sharingPolicy];

  return getScopeOptions(canInviteExternal).flatMap<AvailableScopeOption>(
    (option) => {
      if (!allowedScopes.includes(option.value)) {
        return [];
      }
      switch (option.value) {
        case "emails_only":
        case "workspace_and_emails":
        case "workspace":
          // Internal email invites are always available.
          return [{ ...option, disabled: false }];
        case "public":
          if (canPublish) {
            return [{ ...option, disabled: false }];
          }
          // Without the publish permission, keep the public option visible (disabled) only when
          // the frame is already public, so its current state stays visible.
          return currentScope === "public"
            ? [{ ...option, disabled: true }]
            : [];
        default:
          assertNeverAndIgnore(option.value);
          return [];
      }
    }
  );
}
