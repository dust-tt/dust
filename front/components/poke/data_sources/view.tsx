import {
  BracesIcon,
  Button,
  Chip,
  ContentMessage,
  ContextItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ExternalLinkIcon,
  MagnifyingGlassIcon,
  ScrollArea,
  ScrollBar,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import Link from "next/link";
import { useState } from "react";

import { CopyTokenButton } from "@app/components/poke/CopyTokenButton";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithLink,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { isWebhookBasedProvider } from "@app/lib/connector_providers";
import { clientFetch } from "@app/lib/egress/client";
import {
  decodeSqids,
  formatTimestampToFriendlyDate,
  timeAgoFrom,
} from "@app/lib/utils";
import type { CheckStuckResponseBody } from "@app/pages/api/poke/workspaces/[wId]/data_sources/[dsId]/check-stuck";
import type {
  CoreAPIDataSource,
  DataSourceType,
  DataSourceViewType,
  InternalConnectorType,
  WorkspaceType,
} from "@app/types";
import { pluralize } from "@app/types";

export function ViewDataSourceTable({
  connector,
  coreDataSource,
  dataSource,
  dataSourceViews,
  owner,
  temporalWorkspace,
  temporalRunningWorkflows,
}: {
  connector: InternalConnectorType | null;
  coreDataSource: CoreAPIDataSource;
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
  owner: WorkspaceType;
  temporalWorkspace: string;
  temporalRunningWorkflows: {
    workflowId: string;
    runId: string;
    status: string;
  }[];
}) {
  const [showRawObjectsModal, setShowRawObjectsModal] = useState(false);

  const isPaused = connector && !!connector.pausedAt;
  const isRunning = temporalRunningWorkflows.length > 0;
  const isScheduleBased =
    dataSource.connectorProvider === "gong" ||
    dataSource.connectorProvider === "intercom";

  const systemView = dataSourceViews.find((view) => view.kind === "default");

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
              <h2 className="text-md flex-grow pb-4 font-bold">Overview</h2>
              <Button
                aria-label="View raw objects"
                variant="outline"
                size="sm"
                onClick={() => setShowRawObjectsModal(true)}
                icon={BracesIcon}
                label="Show raw objects"
              />
            </div>
            {isPaused && isRunning && (
              <Chip color="warning" size="sm" className="my-4">
                Connector is marked as paused but has temporal workflows
                running. Potential resolution: unpause the connector.
              </Chip>
            )}
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
                  <PokeTableCell>System view</PokeTableCell>
                  <PokeTableCellWithLink
                    href={`/poke/${owner.sId}/spaces/${systemView?.spaceId}/data_source_views/${systemView?.sId}`}
                    content={systemView?.sId ?? "N/A"}
                  />
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell>Access token</PokeTableCell>
                  <PokeTableCell>
                    {connector ? (
                      <CopyTokenButton
                        tokenUrl={`/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/token`}
                        label="Get access token"
                      />
                    ) : (
                      "N/A"
                    )}
                  </PokeTableCell>
                </PokeTableRow>

                <PokeTableRow>
                  <PokeTableCell>Created at</PokeTableCell>
                  <PokeTableCell>
                    {formatTimestampToFriendlyDate(dataSource.createdAt)}
                  </PokeTableCell>
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
                      href={`https://app.datadoghq.eu/logs?query=%40connectorId%3A${dataSource.connectorId}`}
                      target="_blank"
                      className="text-sm text-highlight-400"
                    >
                      Datadog(connector)
                    </Link>{" "}
                    /{" "}
                    <Link
                      href={`https://cloud.temporal.io/namespaces/${temporalWorkspace}/${
                        isScheduleBased ? "schedules" : "workflows"
                      }?query=connectorId%3D%22${dataSource.connectorId}%22`}
                      target="_blank"
                      className="text-sm text-highlight-400"
                    >
                      Temporal
                    </Link>{" "}
                    /{" "}
                    <Link
                      href={`https://app.datadoghq.eu/logs?query=service%3Acore%20%40data_source_internal_id%3A${coreDataSource.data_source_internal_id}%20&agg_m=count&agg_m_source=base&agg_t=count&cols=host%2Cservice&fromUser=true&messageDisplay=inline&refresh_mode=sliding&storage=hot&stream_sort=desc&view=spans&viz=stream`}
                      target="_blank"
                      className="text-sm text-highlight-400"
                    >
                      Datadog(Qdrant)
                    </Link>
                  </PokeTableCell>
                </PokeTableRow>
                {connector && (
                  <>
                    <PokeTableRow>
                      <PokeTableCell>Is Running? </PokeTableCell>
                      <PokeTableCell>{isRunning ? "✅" : "❌"}</PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Is Stuck?</PokeTableCell>
                      <PokeTableCell>
                        <CheckConnectorStuck
                          owner={owner}
                          dsId={dataSource.sId}
                          isRunning={isRunning}
                          temporalWorkspace={temporalWorkspace}
                        />
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Paused</PokeTableCell>
                      <PokeTableCell>
                        {connector?.pausedAt ? (
                          <span className="font-bold text-green-600">
                            {timeAgoFrom(connector?.pausedAt, {
                              useLongFormat: true,
                            })}{" "}
                            ago
                          </span>
                        ) : (
                          "N/A"
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Error type</PokeTableCell>
                      <PokeTableCell>
                        {connector?.errorType ? (
                          <span className="font-bold text-warning-500">
                            {connector.errorType}
                          </span>
                        ) : (
                          <span className="font-bold text-green-600">none</span>
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>First sync progress</PokeTableCell>
                      <PokeTableCell>
                        {connector?.firstSyncProgress ? (
                          <span className="font-bold">
                            {connector?.firstSyncProgress}
                          </span>
                        ) : (
                          <span>N/A</span>
                        )}
                      </PokeTableCell>
                    </PokeTableRow>
                    <PokeTableRow>
                      <PokeTableCell>Last sync start</PokeTableCell>
                      <PokeTableCell>
                        {connector?.lastSyncStartTime ? (
                          timeAgoFrom(connector?.lastSyncStartTime, {
                            useLongFormat: true,
                          }) + " ago"
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
                          }) + " ago"
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
                        {connector?.lastSyncSuccessfulTime ? (
                          <span className="font-bold text-green-600">
                            {timeAgoFrom(connector?.lastSyncSuccessfulTime, {
                              useLongFormat: true,
                            })}{" "}
                            ago
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
  connector: InternalConnectorType | null;
  coreDataSource: CoreAPIDataSource;
  dataSource: DataSourceType;
}) {
  const { isDark } = useTheme();
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Data source raw objects</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex max-h-96 flex-col" hideScrollBar>
          <DialogContainer>
            <span className="text-sm font-bold">dataSource</span>
            <JsonViewer
              theme={isDark ? "dark" : "light"}
              value={decodeSqids(dataSource)}
              rootName={false}
              defaultInspectDepth={1}
            />
            <span className="text-sm font-bold">coreDataSource</span>
            <JsonViewer
              theme={isDark ? "dark" : "light"}
              value={decodeSqids(coreDataSource)}
              rootName={false}
              defaultInspectDepth={1}
            />
            <span className="text-sm font-bold">connector</span>
            <JsonViewer
              theme={isDark ? "dark" : "light"}
              value={decodeSqids(connector)}
              rootName={false}
              defaultInspectDepth={1}
            />
          </DialogContainer>
          <ScrollBar className="py-0" />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface CheckConnectorStuckProps {
  owner: WorkspaceType;
  dsId: string;
  isRunning: boolean;
  temporalWorkspace: string;
}

function CheckConnectorStuck({
  owner,
  dsId,
  isRunning,
  temporalWorkspace,
}: CheckConnectorStuckProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CheckStuckResponseBody | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const checkStuck = async () => {
    setIsLoading(true);
    try {
      const res = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/${dsId}/check-stuck`
      );
      if (!res.ok) {
        const err = await res.json();
        alert(`Failed to check connector status: ${JSON.stringify(err)}`);
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch (error) {
      alert(`Error checking connector: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isRunning) {
    return <Chip label="Not Running" color="primary" size="xs" />;
  }

  if (!result) {
    return (
      <Button
        variant="outline"
        label={isLoading ? "Checking..." : "Check"}
        icon={isLoading ? Spinner : MagnifyingGlassIcon}
        disabled={isLoading}
        onClick={!isLoading ? checkStuck : undefined}
        size="xs"
      />
    );
  }

  return (
    <>
      <StuckActivitiesDialog
        show={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        result={result}
        temporalWorkspace={temporalWorkspace}
      />
      <div className="flex items-center gap-2">
        <Tooltip
          label={result.message}
          trigger={
            <Chip
              label={result.isStuck ? "Stuck" : "Not Stuck"}
              color={result.isStuck ? "info" : "success"}
              size="xs"
            />
          }
        />
        {result.isStuck && result.workflows.length > 0 && (
          <Button
            variant="ghost"
            label="Show details"
            onClick={() => setShowDetailsModal(true)}
            size="xs"
          />
        )}
      </div>
    </>
  );
}

interface StuckActivitiesDialogProps {
  show: boolean;
  onClose: () => void;
  result: CheckStuckResponseBody;
  temporalWorkspace: string;
}

function StuckActivitiesDialog({
  show,
  onClose,
  result: { workflows },
  temporalWorkspace,
}: StuckActivitiesDialogProps) {
  const totalStuckActivities = workflows.reduce(
    (sum, wf) => sum + wf.stuckActivities.length,
    0
  );

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Stuck Activities Details</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <ContentMessage
              variant="info"
              size="sm"
              title={
                `Found ${totalStuckActivities} stuck ` +
                `${totalStuckActivities === 1 ? "activity" : "activities"} ` +
                `across ${workflows.length} workflow${pluralize(workflows.length)}`
              }
              className="max-w-full"
            />
            {workflows.map((workflow) => (
              <ContextItem.List key={workflow.workflowId} hasBorder>
                <ContextItem
                  title={
                    <span className="font-mono text-sm">
                      {workflow.workflowId}
                    </span>
                  }
                  visual={null}
                  hasSeparator={false}
                  action={
                    <Button
                      icon={ExternalLinkIcon}
                      variant="outline"
                      href={`https://cloud.temporal.io/namespaces/${temporalWorkspace}/workflows/${workflow.workflowId}`}
                      size="xs"
                      className="p-2"
                      label="Workflow"
                      target="_blank"
                    />
                  }
                />
                {workflow.stuckActivities.map((activity, idx) => (
                  <ContextItem
                    key={idx}
                    title={
                      <span className="text-sm">{activity.activityType}</span>
                    }
                    visual={
                      <Chip
                        color="warning"
                        label={`${activity.attempt} attempts`}
                        size="xs"
                      />
                    }
                    action={
                      <Button
                        icon={ExternalLinkIcon}
                        variant="outline"
                        href={
                          "https://app.datadoghq.eu/logs?query=%40dd.env%3Aprod%20%40dd.service%3Aconnectors-worker" +
                          `%20%40activityType%3A${encodeURIComponent(activity.activityType)}` +
                          `%20%40workflowId%3A${encodeURIComponent(workflow.workflowId.replaceAll(":", "\\:"))}` +
                          "&agg_m=count&agg_m_source=base&agg_t=count&cols=%40workflowId&" +
                          "fromUser=true&messageDisplay=inline&refresh_mode=sliding&storage=hot&" +
                          "stream_sort=time%2Cdesc&viz=stream"
                        }
                        size="xs"
                        className="p-2"
                        label="Logs"
                        target="_blank"
                      />
                    }
                  >
                    {activity.lastFailure && (
                      <div className="text-sm text-warning-500">
                        {activity.lastFailure}
                      </div>
                    )}
                  </ContextItem>
                ))}
              </ContextItem.List>
            ))}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Close",
            variant: "outline",
            onClick: onClose,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
