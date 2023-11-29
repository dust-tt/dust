import {
  DustAppRunConfigurationType,
  isDustAppRunConfiguration,
} from "@app/types/assistant/actions/dust_app_run";
import {
  DataSourceConfiguration,
  isRetrievalConfiguration,
} from "@app/types/assistant/actions/retrieval";
import { AgentConfigurationType } from "@app/types/assistant/agent";
import { Modal, Avatar, CloudArrowDownIcon } from "@dust-tt/sparkle";
import ReactMarkdown from "react-markdown";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { ConnectorProvider } from "@app/lib/connectors_api";
import { useApp } from "@app/lib/swr";
import { WorkspaceType } from "@app/types/user";

export function AssistantDetails({
  owner,
  assistant,
  show,
  onClose,
}: {
  owner: WorkspaceType;
  assistant: AgentConfigurationType | null;
  show: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={show}
      title={`@${assistant?.name}`}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 p-6 text-sm text-element-700">
        <div className="flex">buttons</div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Avatar
            visual={<img src={assistant?.pictureUrl} alt="Assistant avatar" />}
            size="md"
          />
          <div>{assistant?.description}</div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">Instructions</div>
          <ReactMarkdown className="max-h-64 overflow-y-auto">
            {assistant?.generation?.prompt || ""}
          </ReactMarkdown>
        </div>
        {assistant?.action ? (
          isDustAppRunConfiguration(assistant.action) ? (
            <div className="flex flex-col gap-2">
              <div className="text-lg font-bold text-element-800">Action</div>
              <DustAppSection dustApp={assistant.action} owner={owner} />
            </div>
          ) : isRetrievalConfiguration(assistant.action) ? (
            <div className="flex flex-col gap-2">
              <div className="text-lg font-bold text-element-800">
                Data source(s)
              </div>
              <DataSourcesSection
                dataSourceConfigurations={assistant.action.dataSources}
              />
            </div>
          ) : null
        ) : null}
      </div>
    </Modal>
  );
}

function DataSourcesSection({
  dataSourceConfigurations,
}: {
  dataSourceConfigurations: DataSourceConfiguration[];
}) {
  const getProviderName = (ds: DataSourceConfiguration) =>
    ds.dataSourceId.startsWith("managed-")
      ? (ds.dataSourceId.slice(8) as ConnectorProvider)
      : undefined;
  const compareDatasourceNames = (
    a: DataSourceConfiguration,
    b: DataSourceConfiguration
  ) => {
    const aProviderName = getProviderName(a);
    const bProviderName = getProviderName(b);
    if (aProviderName && bProviderName) {
      return aProviderName > bProviderName ? -1 : 1;
    }
    if (aProviderName) {
      return -1;
    }
    if (bProviderName) {
      return 1;
    }
    return a.dataSourceId > b.dataSourceId ? -1 : 1;
  };
  return (
    <div className="flex flex-col gap-1">
      {dataSourceConfigurations.sort(compareDatasourceNames).map((ds) => {
        const providerName = getProviderName(ds);
        const DsLogo = providerName
          ? CONNECTOR_CONFIGURATIONS[providerName].logoComponent
          : CloudArrowDownIcon;
        const dsDocumentNumberText = `(${
          ds.filter.parents?.in.length ?? "all"
        } elements)`;
        return (
          <div className="flex flex-col gap-2" key={ds.dataSourceId}>
            <div className="flex items-center gap-2 capitalize">
              <div>
                <DsLogo />
              </div>
              <div>{`${
                providerName ?? ds.dataSourceId
              } ${dsDocumentNumberText}`}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function DustAppSection({
  owner,
  dustApp,
}: {
  owner: WorkspaceType;
  dustApp: DustAppRunConfigurationType;
}) {
  const { app } = useApp({ workspaceId: owner.sId, appId: dustApp.appId });
  return <div>{app ? app.name : ""}</div>;
}
