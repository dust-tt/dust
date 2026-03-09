import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { CreateSkillSuggestionSheet } from "@app/components/poke/skills/CreateSkillSuggestionSheet";
import { makeColumnsForSkills } from "@app/components/poke/skills/columns";
import { usePokeSkills } from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

interface SkillsDataTableProps {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}

export function SkillsDataTable({ owner, loadOnInit }: SkillsDataTableProps) {
  const [showCreateSuggestionSheet, setShowCreateSuggestionSheet] =
    useState(false);

  const skillButtons = (
    <div className="flex flex-row gap-2">
      <Button
        aria-label="Create skill suggestion"
        variant="outline"
        size="sm"
        onClick={() => setShowCreateSuggestionSheet(true)}
        label="💡 Create skill suggestion"
      />
    </div>
  );

  return (
    <>
      <CreateSkillSuggestionSheet
        show={showCreateSuggestionSheet}
        onClose={() => setShowCreateSuggestionSheet(false)}
        owner={owner}
      />
      <PokeDataTableConditionalFetch
        header="Skills"
        globalActions={skillButtons}
        owner={owner}
        loadOnInit={loadOnInit}
        useSWRHook={usePokeSkills}
      >
        {(data) => (
          <PokeDataTable columns={makeColumnsForSkills(owner)} data={data} />
        )}
      </PokeDataTableConditionalFetch>
    </>
  );
}
