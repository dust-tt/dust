import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { makeColumnsForProjectConversations } from "@app/components/poke/projects/conversations/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeProjectConversations } from "@app/poke/swr/project_conversations";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

const PAGE_SIZE = 20;

interface ProjectConversationDataTableProps {
  owner: LightWorkspaceType;
  projectId: string;
}

export function ProjectConversationDataTable({
  owner,
  projectId,
}: ProjectConversationDataTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const useConversationsForProject = (props: PokeConditionalFetchProps) =>
    usePokeProjectConversations({ ...props, limit, projectId });

  return (
    <PokeDataTableConditionalFetch
      header="Conversations"
      owner={owner}
      useSWRHook={useConversationsForProject}
    >
      {({ conversations, hasMore, isLoadingMore }) => (
        <div className="flex flex-col gap-3">
          <PokeDataTable
            columns={makeColumnsForProjectConversations(owner)}
            data={conversations}
            pageSize={PAGE_SIZE}
          />
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                label="Load more"
                isLoading={isLoadingMore}
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              />
            </div>
          )}
        </div>
      )}
    </PokeDataTableConditionalFetch>
  );
}
