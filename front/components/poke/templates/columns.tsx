import { Chip, IconButton } from "@dust-tt/sparkle";
import type { TemplateTagCodeType, TemplateVisibility } from "@dust-tt/types";
import { TEMPLATES_TAGS_CONFIG } from "@dust-tt/types";
import { ArrowsUpDownIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

export interface TemplatesDisplayType {
  id: string;
  name: string;
  visibility: TemplateVisibility;
  tags: TemplateTagCodeType[];
}

export function makeColumnsForTemplates(): ColumnDef<TemplatesDisplayType>[] {
  return [
    {
      accessorKey: "id",
      cell: ({ row }) => {
        const id: string = row.getValue("id");

        return (
          <Link
            className="font-bold hover:underline"
            href={`/poke/templates/${id}`}
          >
            {id}
          </Link>
        );
      },
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Id</p>
            <IconButton
              variant="tertiary"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Name</p>
            <IconButton
              variant="tertiary"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "visibility",
      header: ({ column }) => {
        return (
          <div className="flex space-x-2">
            <p>Visibility</p>
            <IconButton
              variant="tertiary"
              icon={ArrowsUpDownIcon}
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            />
          </div>
        );
      },
    },
    {
      accessorKey: "tags",
      header: () => (
        <div className="flex space-x-2">
          <p>Tags</p>
        </div>
      ),
      cell: ({ row }) => {
        const tags: TemplateTagCodeType[] = row.getValue("tags");
        const tagChips = tags.map((t) => (
          <Chip
            label={
              TEMPLATES_TAGS_CONFIG[t] ? TEMPLATES_TAGS_CONFIG[t].label : t
            }
            key={t}
            size="xs"
          />
        ));

        return <div className="flex gap-x-2">{tagChips}</div>;
      },
    },
  ];
}
