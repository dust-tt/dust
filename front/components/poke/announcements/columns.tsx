import { Button, Chip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { AnnouncementContentType } from "@app/types/announcement";

export function makeColumnsForAnnouncements(): ColumnDef<AnnouncementContentType>[] {
  return [
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <Chip
          color={row.original.type === "event" ? "green" : "blue"}
          label={row.original.type === "event" ? "Event" : "Changelog"}
          size="sm"
        />
      ),
    },
    {
      accessorKey: "imageUrl",
      header: "Image",
      cell: ({ row }) =>
        row.original.imageUrl ? (
          <img
            src={row.original.imageUrl}
            alt={row.original.title}
            className="h-10 w-10 rounded object-cover"
          />
        ) : null,
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <Link
          href={`/poke/announcements/${row.original.sId}`}
          className="text-highlight-500 hover:text-highlight-300"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <code className="text-xs text-muted-foreground">
          {row.original.slug}
        </code>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Chip
          color={row.original.isPublished ? "success" : "info"}
          label={row.original.isPublished ? "Published" : "Draft"}
          size="sm"
        />
      ),
    },
    {
      accessorKey: "showInAppBanner",
      header: "In App Banner",
      cell: ({ row }) => (
        <span className="text-lg">
          {row.original.showInAppBanner ? "✅" : "❌"}
        </span>
      ),
    },
    {
      accessorKey: "eventDate",
      header: "Event Date",
      cell: ({ row }) =>
        row.original.type === "event" && row.original.eventDate
          ? formatTimestampToFriendlyDate(row.original.eventDate)
          : "N/A",
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Link href={`/poke/announcements/${row.original.sId}`}>
            <Button variant="outline" size="xs" label="Edit" />
          </Link>
        </div>
      ),
    },
  ];
}
