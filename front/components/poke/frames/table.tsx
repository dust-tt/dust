import { makeColumnsForFrames } from "@app/components/poke/frames/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFrames } from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

const PAGE_SIZE = 20;

interface FramesDataTableProps {
  loadOnInit?: boolean;
  owner: LightWorkspaceType;
}

export function FramesDataTable({ loadOnInit, owner }: FramesDataTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const useFramesWithLimit = (props: PokeConditionalFetchProps) =>
    usePokeFrames({ ...props, limit });

  return (
    <PokeDataTableConditionalFetch
      header="Frames"
      loadOnInit={loadOnInit}
      owner={owner}
      useSWRHook={useFramesWithLimit}
    >
      {({ items, hasMore, isLoadingMore }) => (
        <div className="flex flex-col gap-3">
          <PokeDataTable
            columns={makeColumnsForFrames({ owner })}
            data={items}
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
