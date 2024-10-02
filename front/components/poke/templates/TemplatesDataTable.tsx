import { Chip, DataTable, Searchbar, Spinner } from "@dust-tt/sparkle";
import type { TemplateTagCodeType, TemplateVisibility } from "@dust-tt/types";
import { TEMPLATES_TAGS_CONFIG } from "@dust-tt/types";
import type { CellContext } from "@tanstack/react-table";
import Link from "next/link";
import React, { useState } from "react";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { usePokeAssistantTemplates } from "@app/poke/swr";

export interface TemplatesDisplayType {
  id: string;
  name: string;
  visibility: TemplateVisibility;
  tags: TemplateTagCodeType[];
  onClick?: () => void;
}

type Info = CellContext<TemplatesDisplayType, unknown>;

function prepareTemplatesForDisplay(templates: any[]): TemplatesDisplayType[] {
  return templates.map((t) => ({
    id: t.sId,
    name: t.handle,
    visibility: t.visibility,
    tags: t.tags,
  }));
}

export function makeColumnsForTemplates() {
  return [
    {
      accessorKey: "id",
      cell: (info: Info) => {
        const id: string = info.row.getValue("id");
        return (
          <>
            <Link
              className="font-bold hover:underline"
              href={`/poke/templates/${id}`}
            >
              {id}
            </Link>
          </>
        );
      },
    },
    {
      accessorKey: "name",
      cell: (info: Info) => (
        <DataTable.CellContent>{info.row.original.name}</DataTable.CellContent>
      ),
    },
    {
      accessorKey: "visibility",
      cell: (info: Info) => (
        <>
          <DataTable.CellContent>
            {info.row.original.visibility}
          </DataTable.CellContent>
        </>
      ),
    },
    {
      accessorKey: "tags",
      cell: (info: Info) => {
        const tags: TemplateTagCodeType[] = info.row.getValue("tags");
        const tagChips = tags.map((t) => (
          <Chip
            label={
              TEMPLATES_TAGS_CONFIG[t] ? TEMPLATES_TAGS_CONFIG[t].label : t
            }
            key={t}
            size="xs"
          />
        ));
        return (
          <>
            <div className="flex gap-x-2">{tagChips}</div>
          </>
        );
      },
    },
  ];
}

export function TemplatesDataTable() {
  const { assistantTemplates, isAssistantTemplatesLoading } =
    usePokeAssistantTemplates();
  const [templateSearch, setTemplateSearch] = useState<string>("");

  const data = prepareTemplatesForDisplay(assistantTemplates);
  const columns = makeColumnsForTemplates();

  return (
    <div className="border-material-200 my-4 flex w-full flex-col gap-2 rounded-lg border p-4">
      <div className="flex w-full items-center justify-between gap-3">
        <h2 className="text-md flex-grow pb-4 font-bold">Templates:</h2>
        <PokeButton
          aria-label="Create template"
          variant="outline"
          size="sm"
          asChild
        >
          <Link href="/poke/templates/new">Create template</Link>
        </PokeButton>
      </div>
      <Searchbar
        name="search"
        placeholder="Search (Name)"
        value={templateSearch}
        onChange={(s) => {
          setTemplateSearch(s);
        }}
      />
      <div className="mt-2 flex w-full flex-col items-center gap-2">
        {isAssistantTemplatesLoading ? (
          <Spinner variant="color" />
        ) : (
          <DataTable
            data={data}
            columns={columns}
            filter={templateSearch}
            filterColumn={"name"}
          />
        )}
      </div>
    </div>
  );
}
