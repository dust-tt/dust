import {
  Button,
  Chip,
  DataTable,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";
import Link from "next/link";
import React, { useState } from "react";

import type { FetchAssistantTemplatesResponse } from "@app/pages/api/templates";
import { usePokeAssistantTemplates, usePokePullTemplates } from "@app/poke/swr";
import type { TemplateTagCodeType, TemplateVisibility } from "@app/types";
import { isDevelopment, TEMPLATES_TAGS_CONFIG } from "@app/types";

export interface TemplatesDisplayType {
  id: string;
  name: string;
  visibility: TemplateVisibility;
  tags: TemplateTagCodeType[];
  onClick?: () => void;
}

type Info = CellContext<TemplatesDisplayType, unknown>;

function prepareTemplatesForDisplay(
  templates: FetchAssistantTemplatesResponse["templates"]
): TemplatesDisplayType[] {
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
          <Link
            className="font-bold hover:underline"
            href={`/poke/templates/${id}`}
          >
            {id}
          </Link>
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
        <DataTable.CellContent>
          {info.row.original.visibility}
        </DataTable.CellContent>
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
        return <div className="flex gap-x-2">{tagChips}</div>;
      },
    },
  ];
}

export function TemplatesDataTable({
  dustRegionSyncEnabled,
}: {
  dustRegionSyncEnabled: boolean;
}) {
  const { assistantTemplates, isAssistantTemplatesLoading } =
    usePokeAssistantTemplates();
  const { doPull, isPulling } = usePokePullTemplates();
  const [templateSearch, setTemplateSearch] = useState<string>("");

  const data = prepareTemplatesForDisplay(assistantTemplates);
  const columns = makeColumnsForTemplates();

  return (
    <div className="border-material-200 my-4 flex w-full flex-col gap-2 rounded-lg border p-4">
      <div className="flex w-full items-center justify-between gap-3">
        <h2 className="text-md flex-grow pb-4 font-bold">Templates:</h2>
        {dustRegionSyncEnabled && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPulling}
            onClick={async () => {
              await doPull();
            }}
            isLoading={isPulling}
            label={isPulling ? "Pulling..." : "Pull templates"}
          />
        )}
        {!dustRegionSyncEnabled ||
          (isDevelopment() && (
            <Button
              aria-label="Create template"
              variant="outline"
              size="sm"
              label="Create template"
              href="/poke/templates/new"
            />
          ))}
      </div>
      <SearchInput
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
