import { Spinner2 } from "@dust-tt/sparkle";
import Link from "next/link";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { TemplatesDisplayType } from "@app/components/poke/templates/columns";
import { makeColumnsForTemplates } from "@app/components/poke/templates/columns";
import { usePokeAssistantTemplates } from "@app/poke/swr";

function prepareTemplatesForDisplay(templates: any[]): TemplatesDisplayType[] {
  return templates.map((t) => ({
    id: t.sId,
    name: t.handle,
    visibility: t.visibility,
    tags: t.tags,
  }));
}

export function TemplatesDataTable() {
  const { assistantTemplates, isAssistantTemplatesLoading } =
    usePokeAssistantTemplates();

  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
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
      {isAssistantTemplatesLoading ? (
        <Spinner2 variant="color" />
      ) : (
        <PokeDataTable
          columns={makeColumnsForTemplates()}
          data={prepareTemplatesForDisplay(assistantTemplates)}
          pageSize={100}
        />
      )}
    </div>
  );
}
