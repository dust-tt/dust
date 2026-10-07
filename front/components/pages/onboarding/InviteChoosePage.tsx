import config from "@app/lib/api/config";
import { useCellContext } from "@app/lib/auth/CellContext";
import { useUser } from "@app/lib/swr/user";
import { usePendingInvitations } from "@app/lib/swr/workspaces";
import type { CellType } from "@app/types/cell";
import type { ActiveRoleType } from "@app/types/user";
import {
  BarHeader,
  Button,
  cn,
  DustLogoSquare,
  Icon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

const ROLE_LABELS: Record<ActiveRoleType, MessageDescriptor> = {
  admin: msg({ message: "admin", context: "workspace role" }),
  manager: msg({ message: "manager", context: "workspace role" }),
  user: msg({ message: "user", context: "workspace role" }),
};

export function InviteChoosePage() {
  const { t } = useLingui();
  const { cells } = useCellContext();
  const { user } = useUser();
  const { pendingInvitations, isPendingInvitationsLoading } =
    usePendingInvitations();

  const handleInvitationSelection = useCallback(
    (token: string, cell?: CellType) => {
      const baseUrl = cell
        ? cells.find((c) => c.name === cell)?.url
        : config.getApiBaseUrl();
      window.location.assign(
        `${baseUrl}/api/login?inviteToken=${encodeURIComponent(token)}`
      );
    },
    [cells]
  );

  const firstName = user?.firstName;
  const email = user?.email;

  if (isPendingInvitationsLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Page variant="normal">
      <BarHeader title={t`Joining Dust`} className="ml-10 lg:ml-0" />
      <div className="mx-auto mt-40 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="items-left justify-left flex flex-row">
            <Icon visual={DustLogoSquare} size="md" />
          </div>
          <span className="heading-2xl text-foreground">
            <Trans>Hello {firstName}!</Trans>
          </span>
        </div>
        <div className="flex flex-col gap-4">
          {pendingInvitations.length === 0 ? (
            <div className="body-sm text-muted-foreground">
              {email ? (
                <Trans>
                  We couldn't find any pending invitations for {email}. Please
                  contact your workspace admin or try another email address.
                </Trans>
              ) : (
                <Trans>
                  We couldn't find any pending invitations for your account.
                  Please contact your workspace admin or try another email
                  address.
                </Trans>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="body-md text-foreground">
                <Trans>Choose the workspace you would like to join:</Trans>
              </div>
              <div className="flex flex-col gap-3">
                {pendingInvitations.map((invitation) => {
                  const role = t(ROLE_LABELS[invitation.initialRole]);
                  return (
                    <div
                      key={invitation.workspaceName}
                      className={cn(
                        "bg-muted-background",
                        "border-border",
                        "flex items-center justify-between gap-4 rounded-xl border p-4 shadow-sm"
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="body-md font-medium text-foreground">
                          {invitation.workspaceName}
                        </span>
                        <span className="body-sm text-muted-foreground">
                          <Trans>Role: {role}</Trans>
                        </span>
                      </div>
                      <Button
                        label={t`Join`}
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          handleInvitationSelection(
                            invitation.token,
                            invitation.cell
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

export default InviteChoosePage;
