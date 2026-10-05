import { makeColumnsForFrames } from "@app/components/poke/frames/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFrames } from "@app/poke/swr/frames";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { CheckboxWithText } from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useState } from "react";

const PAGE_SIZE = 20;

interface FramesDataTableProps {
  loadOnInit?: boolean;
  owner: LightWorkspaceType;
}

export function FramesDataTable({ loadOnInit, owner }: FramesDataTableProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const [hasSandbox, setHasSandbox] = useState(true);
  const useFramesPage = (props: PokeConditionalFetchProps) =>
    usePokeFrames({
      ...props,
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      hasSandbox,
    });

  return (
    <PokeDataTableConditionalFetch
      header="Frames"
      loadOnInit={loadOnInit}
      owner={owner}
      useSWRHook={useFramesPage}
      globalActions={
        <CheckboxWithText
          text="Only with a sandbox"
          checked={hasSandbox}
          onCheckedChange={(checked) => {
            setHasSandbox(checked === true);
            // A different filter makes the current page number meaningless.
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        />
      }
    >
      {({ items, totalCount, isValidating }) => (
        <PokeDataTable
          columns={makeColumnsForFrames({ owner })}
          data={items}
          isValidating={isValidating}
          serverSideRowCount={totalCount}
          pagination={pagination}
          onPaginationChange={setPagination}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
