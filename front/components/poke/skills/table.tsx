import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSkills } from "@app/components/poke/skills/columns";
import { usePokeSkills } from "@app/poke/swr/skills";
import type { LightWorkspaceType } from "@app/types";

interface SkillsDataTableProps {
  owner: LightWorkspaceType;
  loadOnInit?: boolean;
}

export function SkillsDataTable({ owner, loadOnInit }: SkillsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Skills"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeSkills}
    >
      {(data) => (
        <PokeDataTable columns={makeColumnsForSkills(owner)} data={data} />
      )}
    </PokeDataTableConditionalFetch>
  );
}
