import { Spinner2 } from "@dust-tt/sparkle";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { TemplatesDisplayType } from "@app/components/poke/templates/columns";
import { makeColumnsForTemplates } from "@app/components/poke/templates/columns";
import { usePokeAssistantTemplates } from "@app/poke/swr";

function prepareTemplatesForDisplay(templates: any[]): TemplatesDisplayType[] {
  return templates.map((t) => ({
    id: t.sId,
    name: t.handle,
    status: t.visibility,
    tags: t.tags,
  }));
}

export function TemplatesDataTable() {
  const { assistantTemplates, isAssistantTemplatesLoading } =
    usePokeAssistantTemplates();

  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">Templates:</h2>
      {isAssistantTemplatesLoading ? (
        <Spinner2 variant="color" />
      ) : (
        <PokeDataTable
          columns={makeColumnsForTemplates()}
          data={prepareTemplatesForDisplay(assistantTemplates)}
        />
      )}
    </div>
  );
}
