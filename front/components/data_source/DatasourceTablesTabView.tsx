import {
  Button,
  ContextItem,
  Page,
  PencilSquareIcon,
  PlusIcon,
  ServerIcon,
} from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { TableUploadModal } from "@app/components/data_source/TableUploadModal";
import { tableKey } from "@app/lib/client/tables_query";
import { useTables } from "@app/lib/swr";

export function DatasourceTablesTabView({
  owner,
  readOnly,
  dataSource,
}: {
  owner: WorkspaceType;
  readOnly: boolean;
  dataSource: DataSourceType;
}) {
  const [showTableUploadModal, setShowTableUploadModal] = useState(false);
  const [tableToLoad, setTableToLoad] = useState<string | null>(null);

  const { tables } = useTables({
    workspaceId: owner.sId,
    dataSourceName: dataSource.name,
  });

  return (
    <>
      <Page.Vertical align="stretch">
        <div className="mt-16 flex flex-row">
          <div className="flex flex-1">
            <div className="flex flex-col">
              <div className="flex flex-row">
                <div className="flex flex-initial gap-x-2">
                  <Button variant="tertiary" disabled={true} label="Previous" />
                  <Button variant="tertiary" label="Next" disabled={true} />
                </div>
              </div>
            </div>
          </div>
          {readOnly ? null : (
            <div className="">
              <div className="relative mt-0 flex-none">
                <Button
                  variant="primary"
                  icon={PlusIcon}
                  label="Add table"
                  onClick={() => {
                    setTableToLoad(null);
                    setShowTableUploadModal(true);
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="py-8">
          <ContextItem.List>
            {tables.map((t) => (
              <ContextItem
                key={tableKey({
                  workspaceId: owner.sId,
                  tableId: t.table_id,
                  dataSourceId: dataSource.name,
                })}
                title={`${t.name} (${t.data_source_id})`}
                visual={
                  <ContextItem.Visual
                    visual={({ className }) =>
                      ServerIcon({
                        className: className + " text-element-600",
                      })
                    }
                  />
                }
                action={
                  <Button.List>
                    <Button
                      variant="secondary"
                      icon={PencilSquareIcon}
                      onClick={() => {
                        setTableToLoad(t.table_id);
                        setShowTableUploadModal(true);
                      }}
                      label="Edit"
                      labelVisible={false}
                    />
                  </Button.List>
                }
              ></ContextItem>
            ))}
          </ContextItem.List>
          {tables.length == 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center text-sm text-gray-500">
              <p>No tables found for this Folder.</p>
              <p className="mt-2">
                Tables let you create assistants that can query structured data
                from uploaded CSV files. You can add tables manually by clicking
                on the &quot;Add&nbsp;table&quot; button.
              </p>
            </div>
          ) : null}
        </div>
        <TableUploadModal
          isOpen={showTableUploadModal}
          onClose={() => setShowTableUploadModal(false)}
          dataSource={dataSource}
          owner={owner}
          initialTableId={tableToLoad}
        />
      </Page.Vertical>
    </>
  );
}
