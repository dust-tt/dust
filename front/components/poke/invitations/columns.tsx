import { PokeColumnSortableHeader } from "@app/components/poke/PokeColumnSortableHeader";
import { INVITATION_EXPIRATION_TIME_SEC } from "@app/lib/constants/invitation";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { MembershipInvitationTypeWithLink } from "@app/types/membership_invitation";
import {
  ClipboardIcon,
  IconButton,
  MovingMailIcon,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

const INVITATION_EXPIRATION_TIME_MS = INVITATION_EXPIRATION_TIME_SEC * 1000;

function formatExpiresIn(createdAt: number): {
  label: string;
  isExpired: boolean;
  exactDate: string;
} {
  const expiresAtMs =
    new Date(createdAt).getTime() + INVITATION_EXPIRATION_TIME_MS;
  const nowMs = Date.now();
  const diffMs = expiresAtMs - nowMs;
  const exactDate = new Date(expiresAtMs).toLocaleString();

  if (diffMs <= 0) {
    const agoMs = Math.abs(diffMs);
    const agoHours = Math.floor(agoMs / (1000 * 60 * 60));
    const agoDays = Math.floor(agoHours / 24);
    const label = agoDays > 0 ? `${agoDays}d ago` : `${agoHours}h ago`;
    return { label, isExpired: true, exactDate };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const label = days > 0 ? `in ${days}d` : `in ${hours}h`;
  return { label, isExpired: false, exactDate };
}

export function makeColumnsForInvitations(
  onRevokeInvitation: (email: string) => Promise<void>,
  onReinvite: (invitationId: string) => Promise<void>
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
      id: "expires",
      header: "Expires",
      cell: ({ row }) => {
        const createdAt: number = row.original.createdAt;
        const { label, isExpired, exactDate } = formatExpiresIn(createdAt);
        return (
          <Tooltip
            label={exactDate}
            trigger={
              <span className={isExpired ? "text-red-500" : ""}>{label}</span>
            }
          />
        );
      },
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
      id: "reinvite",
      header: "Reinvite",
      cell: ({ row }) => {
        const invitation = row.original;

        return (
          <IconButton
            icon={MovingMailIcon}
            size="xs"
            variant="outline"
            tooltip="Reinvite (revokes current and sends a new invitation)"
            onClick={async () => {
              await onReinvite(invitation.sId);
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
