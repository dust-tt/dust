import type { FileShareScope } from "@app/types/files";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import { Globe01, Lock01, Users01 } from "@dust-tt/sparkle";

export interface ScopeOption {
  icon: typeof Lock01;
  label: string;
  description: string;
  value: FileShareScope;
}

export interface AvailableScopeOption extends ScopeOption {
  disabled: boolean;
}

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
      icon: Lock01,
      label: canInviteExternal
        ? "Invite only"
        : "Invited workspace members only",
      description: canInviteExternal
        ? "Only the people you invite"
        : "Only the workspace members you invite",
      value: "emails_only",
    },
    {
      icon: Users01,
      label: canInviteExternal
        ? "All workspace members + invites"
        : "All workspace members",
      description: canInviteExternal
        ? "Everyone in your workspace, plus anyone you invite"
        : "Everyone in your workspace",
      value: "workspace_and_emails",
    },
    {
      icon: Globe01,
      label: "Anyone with the link",
      description: "No sign-in required",
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
