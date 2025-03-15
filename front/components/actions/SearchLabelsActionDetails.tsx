import { CollapsibleComponent, MagnifyingGlassIcon } from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { SearchLabelsActionType } from "@app/lib/actions/types/search_labels";

export function SearchLabelsActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<SearchLabelsActionType>) {
  const { output, searchText } = action;

  const tags = output?.tags ?? [];

  return (
    <ActionDetailsWrapper
      actionName="Search labels"
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-foreground dark:text-foreground-night">
            Query
          </span>
          <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
            {searchText}
          </div>
        </div>
        <div>
          <CollapsibleComponent
            rootProps={{ defaultOpen }}
            triggerChildren={
              <span className="text-sm font-bold text-foreground dark:text-foreground-night">
                Results
              </span>
            }
            contentChildren={
              <div className="flex flex-col gap-2">
                {tags.length === 0 ? (
                  <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    No labels found.
                  </div>
                ) : (
                  <ul className="list-inside list-disc space-y-1">
                    {tags.map((tag) => (
                      <li key={tag.tag} className="text-sm">
                        <span className="text-gray-900">{tag.tag}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            }
          />
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
