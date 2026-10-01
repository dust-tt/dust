import { SearchSkillsPage } from "@app/components/pages/builder/skills/SearchSkillsPage";
import { CreateSkillSuggestionSheet } from "@app/components/poke/skills/CreateSkillSuggestionSheet";
import { useAppRouter } from "@app/lib/platform";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface SkillsDataTableProps {
  owner: LightWorkspaceType;
}

export function SkillsDataTable({ owner }: SkillsDataTableProps) {
  const router = useAppRouter();
  const onSelect = useCallback(
    (skillId: string) =>
      void router.push(`/poke/${owner.sId}/skills/${skillId}`),
    [owner.sId, router]
  );
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
      <SearchSkillsPage
        showHeader={false}
        readOnly
        searchEndpoint={`/api/poke/workspaces/${owner.sId}/skills/search`}
        filterHashParam="skillSearch"
        permissionFiltering="redact_unreadable"
        searchActions={skillButtons}
        onSelect={onSelect}
      />
    </>
  );
}
