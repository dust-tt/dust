import type { SelectSpaceSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/selectSpacesSlashCommand";
import { SELECT_SPACE_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/selectSpacesSlashCommand";
import { getSpaceIcon } from "@app/lib/spaces";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";

// Name searched for a row, without spaces or hyphens so "engops" reaches "Eng Ops".
function getCompactSearchName(space: SelectableConversationSpaceType): string {
  return space.name.toLowerCase().replace(/[\s-]+/g, "");
}

export function buildSelectSpacesSlashCommandItems({
  query,
  selectedSpaceIds,
  spaces,
}: {
  query: string;
  selectedSpaceIds: string[];
  spaces: SelectableConversationSpaceType[];
}): SelectSpaceSlashCommand[] {
  const selectedIds = new Set(selectedSpaceIds);
  const items: SelectSpaceSlashCommand[] = spaces
    .filter((space) => !selectedIds.has(space.sId))
    .map((space) => ({
      action: SELECT_SPACE_SLASH_COMMAND_ACTION,
      data: { space },
      icon: getSpaceIcon(space),
      id: `space-${space.sId}`,
      label: space.name,
    }));

  const nameQuery = query
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((word) => word.length > 0)
    .join("");
  if (nameQuery.length === 0) {
    return items;
  }

  return items
    .filter((item) =>
      subFilter(nameQuery, getCompactSearchName(item.data.space))
    )
    .sort((a, b) =>
      compareForFuzzySort(
        nameQuery,
        getCompactSearchName(a.data.space),
        getCompactSearchName(b.data.space)
      )
    );
}
