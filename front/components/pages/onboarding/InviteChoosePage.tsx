import config from "@app/lib/api/config";
import { useCellContext } from "@app/lib/auth/CellContext";
import { useUser } from "@app/lib/swr/user";
import { usePendingInvitations } from "@app/lib/swr/workspaces";
import type { CellType } from "@app/types/cell";
import {
  BarHeader,
  Button,
  cn,
  DustLogoSquare,
  Icon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback } from "react";

export function InviteChoosePage() {
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

  if (isPendingInvitationsLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Page variant="normal">
      <BarHeader title="Joining Dust" className="ml-10 lg:ml-0" />
      <div className="mx-auto mt-40 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="items-left justify-left flex flex-row">
            <Icon visual={DustLogoSquare} size="md" />
          </div>
          <span className="heading-2xl text-foreground">
            Hello {user?.firstName}!
          </span>
        </div>
        <div className="flex flex-col gap-4">
          {pendingInvitations.length === 0 ? (
            <div className="body-sm text-muted-foreground">
              We couldn&apos;t find any pending invitations for{" "}
              {user?.email ?? "your account"}. Please contact your workspace
              admin or try another email address.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="body-md text-foreground">
                Choose the workspace you would like to join:
              </div>
              <div className="flex flex-col gap-3">
                {pendingInvitations.map((invitation) => (
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
                        Role: {invitation.initialRole}
                      </span>
                    </div>
                    <Button
                      label="Join"
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        handleInvitationSelection(
                          invitation.token,
                          // TODO(single-tenant): fix so that invations are using cell, not region.
                          // Fallback to first cell with a matching region.
                          cells.find((c) => c.region === invitation.region)
                            ?.name
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

export default InviteChoosePage;
