import {
  ClipboardIcon,
  IconButton,
  MovingMailIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { MembershipInvitationTypeWithLink } from "@app/types";

export function makeColumnsForInvitations(
  onRevokeInvitation: (email: string) => Promise<void>,
  onResendInvitation: (invitationId: string) => Promise<void>
): ColumnDef<MembershipInvitationTypeWithLink>[] {
  return [
    {
      accessorKey: "sId",
      header: "ID",
    },
    {
      accessorKey: "inviteEmail",
      header: "email",
    },
    {
      accessorKey: "status",
      header: "Status",
    },
    {
      accessorKey: "isExpired",
      header: "Expired",
    },
    {
      accessorKey: "inviteLink",
      header: "Invitation Link",
      cell: ({ row }) => {
        const inviteLink: string = row.getValue("inviteLink");
        return (
          <>
            <a href={inviteLink}>link</a>
            &nbsp;
            <IconButton
              icon={ClipboardIcon}
              variant="outline"
              tooltip="Copy invite link to clipboard"
              size="xs"
              onClick={() =>
                navigator.clipboard.write([
                  new ClipboardItem({
                    "text/plain": new Blob([inviteLink], {
                      type: "text/plain",
                    }),
                  }),
                ])
              }
            />
          </>
        );
      },
    },
    {
      id: "resend",
      header: "Resend",
      cell: ({ row }) => {
        const invitation = row.original;

        return (
          <IconButton
            icon={MovingMailIcon}
            size="xs"
            variant="outline"
            tooltip="Resend invitation email"
            onClick={async () => {
              await onResendInvitation(invitation.sId);
            }}
          />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created at",
      cell: ({ row }) => {
        const createdAt: string | null = row.getValue("createdAt");

        if (!createdAt) {
          return;
        }

        return formatTimestampToFriendlyDate(new Date(createdAt).getTime());
      },
    },
    {
      accessorKey: "initialRole",
      header: "Role",
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const invitation = row.original;

        return (
          <IconButton
            icon={TrashIcon}
            size="xs"
            variant="outline"
            onClick={async () => {
              await onRevokeInvitation(invitation.inviteEmail);
            }}
          />
        );
      },
    },
  ];
}
