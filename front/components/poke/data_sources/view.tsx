import { Modal } from "@dust-tt/sparkle";
import type {
  ConnectorType,
  CoreAPIDataSource,
  DataSourceType,
} from "@dust-tt/types";
import { isWebhookBasedProvider } from "@dust-tt/types";
import { JsonViewer } from "@textea/json-viewer";
import Link from "next/link";
import { useState } from "react";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { formatTimestampToFriendlyDate, timeAgoFrom } from "@app/lib/utils";

export function ViewDataSourceTable({
  connector,
  coreDataSource,
  dataSource,
  temporalWorkspace,
}: {
  connector: ConnectorType | null;
  coreDataSource: CoreAPIDataSource;
  dataSource: DataSourceType;
  temporalWorkspace: string;
}) {
  const [showRawObjectsModal, setShowRawObjectsModal] = useState(false);

  const isPaused = connector && !!connector.pausedAt;

  return (
    <>
      <RawObjectsModal
        connector={connector}
        coreDataSource={coreDataSource}
        dataSource={dataSource}
        onClose={() => setShowRawObjectsModal(false)}
        show={showRawObjectsModal}
      />
      <div className="flex flex-col space-y-8">
        <div className="flex justify-between gap-3">
          <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-md flex-grow pb-4 font-bold">Overview:</h2>
              <PokeButton
                aria-label="View raw objects"
                variant="outline"
                size="sm"
                onClick={() => setShowRawObjectsModal(true)}
              >
                🤓 Show raw objects
              </PokeButton>
            </div>
            <PokeTable>
              <PokeTableBody>
                <PokeTableRow>
                  <PokeTableCell>Name</PokeTableCell>
                  <PokeTableCell>{dataSource.name}</PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Description</PokeTableCell>
                  <PokeTableCell>{dataSource.description}</PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Edited by</PokeTableCell>
                  <PokeTableCell>
                    {dataSource.editedByUser?.fullName ?? "N/A"}
                  </PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Edited at</PokeTableCell>
                  <PokeTableCell>
                    {dataSource.editedByUser?.editedAt
                      ? formatTimestampToFriendlyDate(
                          dataSource.editedByUser.editedAt
                        )
                      : "N/A"}
                  </PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Logs</PokeTableCell>
                  <PokeTableCell>
                    <Link
                      href={`https://cloud.temporal.io/namespaces/${temporalWorkspace}/workflows?query=connectorId%3D%22${dataSource.connectorId}%22`}
                      target="_blank"
                      className="text-sm text-action-400"
                    >
                      Temporal
                    </Link>{" "}
                    /{" "}
                    <Link
                      href={`https://app.datadoghq.eu/logs?query=service%3Acore%20%40data_source_internal_id%3A${coreDataSource.data_source_internal_id}%20&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&fromUser=true&messageDisplay=inline&refresh_mode=sliding&storage=hot&stream_sort=desc&view=spans&viz=stream`}
                      target="_blank"
                      className="text-sm text-action-400"
                    >
                      Datadog(Qdrant)
                    </Link>
                  </PokeTableCell>
                </PokeTableRow>
                {connector && (
                  <>
                    <PokeTableRow>
                      <PokeTableCell>Is Running?</PokeTableCell>
                      <PokeTableCell>{isPaused ? "❌" : "✅"}</PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Paused at</PokeTableCell>
                      <PokeTableCell>
                        {connector?.pausedAt ? (
                          <span className="font-bold text-green-600">
                            {timeAgoFrom(connector?.pausedAt, {
                              useLongFormat: true,
                            })}
                          </span>
                        ) : (
                          "N/A"
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Last sync start</PokeTableCell>
                      <PokeTableCell>
                        {connector?.lastSyncStartTime ? (
                          timeAgoFrom(connector?.lastSyncStartTime, {
                            useLongFormat: true,
                          })
                        ) : (
                          <span className="font-bold text-warning-500">
                            never
                          </span>
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Last sync finish</PokeTableCell>
                      <PokeTableCell>
                        {connector?.lastSyncFinishTime ? (
                          timeAgoFrom(connector?.lastSyncFinishTime, {
                            useLongFormat: true,
                          })
                        ) : (
                          <span className="font-bold text-warning-500">
                            never
                          </span>
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Last sync status</PokeTableCell>
                      <PokeTableCell>
                        {connector?.lastSyncStatus ? (
                          <span className="font-bold">
                            {connector?.lastSyncStatus}
                            {connector.lastSyncStatus === "failed" && (
                              <span className="text-warning-500">
                                &nbsp;{connector.errorType}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="font-bold text-warning-500">
                            N/A
                          </span>
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Last sync success</PokeTableCell>
                      <PokeTableCell>
                        {connector.lastSyncSuccessfulTime ? (
                          <span className="font-bold text-green-600">
                            {timeAgoFrom(connector?.lastSyncSuccessfulTime, {
                              useLongFormat: true,
                            })}
                          </span>
                        ) : (
                          <span className="font-bold text-warning-600">
                            "Never"
                          </span>
                        )}
                        {isWebhookBasedProvider(connector.type) && (
                          <span className="pl-2 italic text-gray-500">
                            (webhook-based)
                          </span>
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                  </>
                )}
              </PokeTableBody>
            </PokeTable>
          </div>
        </div>
      </div>
    </>
  );
}

function RawObjectsModal({
  show,
  onClose,
  connector,
  coreDataSource,
  dataSource,
}: {
  show: boolean;
  onClose: () => void;
  connector: ConnectorType | null;
  coreDataSource: CoreAPIDataSource;
  dataSource: DataSourceType;
}) {
  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      hasChanged={false}
      title="Data source raw objects"
      variant="dialogue"
    >
      <div className="mx-2 my-4 overflow-y-auto">
        <span className="text-sm font-bold">dataSource</span>
        <JsonViewer
          value={dataSource}
          rootName={false}
          defaultInspectDepth={1}
        />
        <span className="text-sm font-bold">coreDataSource</span>
        <JsonViewer
          value={coreDataSource}
          rootName={false}
          defaultInspectDepth={1}
        />
        <span className="text-sm font-bold">connector</span>
        <JsonViewer
          value={connector}
          rootName={false}
          defaultInspectDepth={1}
        />
      </div>
    </Modal>
  );
}
