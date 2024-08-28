import { ClipboardIcon, IconButton } from "@dust-tt/sparkle";
import type { MembershipInvitationType } from "@dust-tt/types";
import type { ColumnDef } from "@tanstack/react-table";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";

export function makeColumnsForInvitations(): ColumnDef<MembershipInvitationType>[] {
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
  ];
}
