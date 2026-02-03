import {
  ClipboardIcon,
  IconButton,
  MovingMailIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { MembershipInvitationTypeWithLink } from "@app/types";

export function makeColumnsForInvitations(
  onRevokeInvitation: (email: string) => Promise<void>,
  onResendInvitation: (invitationId: string) => Promise<void>
): ColumnDef<MembershipInvitationTypeWithLink>[] {
  return [
    {
      accessorKey: "sId",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="sId" />
      ),
    },
    {
      accessorKey: "inviteEmail",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Email" />
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Status" />
      ),
    },
    {
      accessorKey: "isExpired",
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Expired" />
      ),
    },
    {
      accessorKey: "inviteLink",
      header: "Invitation link",
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
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Created at" />
      ),
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
      header: ({ column }) => (
        <PokeColumnSortableHeader column={column} label="Role" />
      ),
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
