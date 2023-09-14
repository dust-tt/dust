import {
  Avatar,
  Button,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  DropdownMenu,
  Icon,
  InformationCircleIcon,
  PageHeader,
  PencilSquareIcon,
  PlusIcon,
  RobotIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";
import { PropsOf } from "@headlessui/react/dist/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { ComponentType, useState } from "react";

import AssistantBuilderDataSourceModal from "@app/components/AssistantBuilderDataSourceModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { ConnectorProvider } from "@app/lib/connectors_api";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { classNames } from "@app/lib/utils";
import { DataSourceType } from "@app/types/data_source";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
  dataSources: DataSourceType[];
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (
    !owner ||
    !user ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner)
  ) {
    return {
      notFound: true,
    };
  }

  const allDataSources = await getDataSources(auth);

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
      dataSources: allDataSources,
    },
  };
};

const DATA_SOURCE_MODES = ["GENERIC", "SELECTED"] as const;
type DataSourceMode = (typeof DATA_SOURCE_MODES)[number];
const DATA_SOURCE_MODE_TO_LABEL: Record<DataSourceMode, string> = {
  GENERIC: "Generic model (No data source)",
  SELECTED: "Selected data sources",
};
export const CONNECTOR_PROVIDER_TO_RESOURCE_NAME: Record<
  ConnectorProvider,
  {
    singular: string;
    plural: string;
  }
> = {
  notion: { singular: "page", plural: "pages" },
  google_drive: { singular: "folder", plural: "folders" },
  slack: { singular: "channel", plural: "channels" },
  github: { singular: "repository", plural: "repositories" },
};

export default function CreateAssistant({
  user,
  owner,
  gaTrackingId,
  dataSources,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("GENERIC");
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [dataSourceConfigs, setDataSourceConfigs] = useState<
    Record<
      string,
      { dataSource: DataSourceType; selectedResources: Record<string, string> }
    >
  >({});
  const [dataSourceToManage, setDataSourceToManage] = useState<{
    dataSource: DataSourceType;
    selectedResources: Record<string, string>;
  } | null>(null);

  const configurableDataSources = dataSources.filter(
    (dataSource) => !dataSourceConfigs[dataSource.name]
  );

  const deleteDataSource = (name: string) => {
    setDataSourceConfigs((configs) => {
      const newConfigs = { ...configs };
      delete newConfigs[name];
      return newConfigs;
    });
  };

  return (
    <>
      <AssistantBuilderDataSourceModal
        isOpen={showDataSourcesModal}
        setOpen={(isOpen) => {
          setShowDataSourcesModal(isOpen);
          if (!isOpen) {
            setDataSourceToManage(null);
          }
        }}
        owner={owner}
        dataSources={configurableDataSources}
        onSave={(dataSource, selectedResources) => {
          setDataSourceConfigs((configs) => ({
            ...configs,
            [dataSource.name]: {
              dataSource,
              selectedResources,
            },
          }));
        }}
        dataSourceToManage={dataSourceToManage}
        onDelete={
          dataSourceToManage
            ? () => deleteDataSource(dataSourceToManage.dataSource.name)
            : undefined
        }
      />
      <AppLayout
        user={user}
        owner={owner}
        gaTrackingId={gaTrackingId}
        topNavigationCurrent="settings"
        subNavigation={subNavigationAdmin({
          owner,
          current: "assistants",
        })}
        titleChildren={
          <AppLayoutSimpleCloseTitle
            title="Design your custom Assistant"
            onClose={() => {
              void router.push(`/w/${owner.sId}/builder/assistants`);
            }}
          />
        }
      >
        <div className="mt-8 flex flex-col space-y-8 pb-8">
          <PageHeader
            title="Assistant Editor"
            icon={RobotIcon}
            description="Make and maintain your customized assistants."
          />
          <div className="mt-8 flex flex-row items-start">
            <div className="flex flex-col items-center space-y-2">
              <Avatar
                size="lg"
                visual={<img src="/static/droidavatar/Droid_Purple_7.jpg" />}
              />
              <Button
                labelVisible={true}
                label="Change"
                variant="tertiary"
                size="xs"
                icon={PencilSquareIcon}
              />
            </div>
            <div className="ml-4 space-y-4">
              <div className="block text-sm font-medium text-element-900">
                Name
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                The name of your Assistant will be used to call your Assistant
                with an “@” handle (for instance @myAssistant). It must be
                unique.
              </div>
              <input
                type="text"
                name="name"
                id="assistantName"
                className={classNames(
                  "block w-full min-w-0 rounded-md text-sm",
                  "border-gray-300 focus:border-action-500 focus:ring-action-500",
                  "bg-structure-50 stroke-structure-50"
                )}
                placeholder="SalesAssistantFrance"
              />
              <div className="block text-sm font-medium text-element-900">
                Description
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                The description helps your collaborators and Dust to understand
                the purpose of the Assistant.
              </div>
              <input
                type="text"
                name="description"
                id="assistantDescription"
                className={classNames(
                  "block w-full min-w-0 rounded-md text-sm",
                  "border-gray-300 focus:border-action-500 focus:ring-action-500",
                  "bg-structure-50 stroke-structure-50"
                )}
                placeholder="Assistant designed to answer sales questions"
              />
            </div>
          </div>
          <div className="mt-8 flex flex-row items-start">
            <div className="space-y-2">
              <div className="text-lg font-bold text-element-900">
                Instructions
              </div>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non
                diam et dolor aliquet.
              </div>
              <input
                type="text"
                name="instructions"
                id="assistantInstructions"
                className={classNames(
                  "block w-full min-w-0 rounded-md text-sm",
                  "border-gray-300 focus:border-action-500 focus:ring-action-500",
                  "bg-structure-50 stroke-structure-50"
                )}
                placeholder="Achieve a particular task, follow a template, use a certain formating..."
              />
              <div className="flex flex-row items-center space-x-2">
                <div className="text-sm font-semibold text-action-500">
                  Select a specific LLM model
                </div>
                <Icon size="xs" visual={InformationCircleIcon} />
              </div>
            </div>
          </div>
          <div className="flex flex-row items-start">
            <div className="space-y-2">
              <div className="text-lg font-bold text-element-900">
                Data sources
              </div>
              <div className="flex-grow self-stretch text-sm font-bold text-element-900">
                <div className="font-normal text-element-700">
                  Customize your Assistant's knowledge. Tips:
                </div>
                <ul role="list" className="list-disc pl-5 pt-2">
                  <li>
                    Setting data sources is not an obligation.
                    <div className="font-normal text-element-700">
                      By default, your assistant will follow your instructions
                      and answer based on commun knowledge. Only do so if the
                      context is important.
                    </div>
                  </li>
                  <li>
                    Choose your data sources with care.
                    <div className="font-normal text-element-700">
                      The more targeted your data are the better the answers
                      will be.
                    </div>
                  </li>
                </ul>
              </div>
              <div className="flex flex-row items-center space-x-2 pt-6">
                <div className="text-sm font-semibold text-element-900">
                  Data source mode:
                </div>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      type="select"
                      labelVisible={true}
                      label={DATA_SOURCE_MODE_TO_LABEL[dataSourceMode]}
                      variant="secondary"
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="topRight" width={260}>
                    {Object.entries(DATA_SOURCE_MODE_TO_LABEL).map(
                      ([key, value]) => (
                        <DropdownMenu.Item
                          key={key}
                          label={value}
                          onClick={() => {
                            setDataSourceMode(key as DataSourceMode);
                          }}
                        />
                      )
                    )}
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
              <DataSourceSelectionSection
                show={dataSourceMode === "SELECTED"}
                dataSourceConfigs={dataSourceConfigs}
                openDataSourceModal={() => {
                  setShowDataSourcesModal(true);
                }}
                canAddDataSource={configurableDataSources.length > 0}
                onManageDataSource={(name) => {
                  setDataSourceToManage(dataSourceConfigs[name]);
                  setShowDataSourcesModal(true);
                }}
                onDelete={deleteDataSource}
              />
              <div className="pt-6 text-base font-semibold text-element-900">
                Timeframe for the data sources
              </div>
              <div className="text-sm font-normal text-element-900">
                Define a specific time frame if you want the Assistant to only
                focus on data from a specific time period.
                <br />
                <span className="font-bold">"Auto"</span> means the assistant
                will define itself, from the question, what the timeframe should
                be.
              </div>
              <div className="flex flex-row items-center space-x-2 pt-2">
                <div className="text-sm font-semibold text-element-900">
                  Timeframe:
                </div>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      type="select"
                      labelVisible={true}
                      label="Auto (default)"
                      variant="secondary"
                      size="sm"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items origin="bottomRight">
                    <DropdownMenu.Item label="item 1" />
                    <DropdownMenu.Item label="item 2" />
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    </>
  );
}

function DataSourceSelectionSection({
  show,
  dataSourceConfigs,
  openDataSourceModal,
  canAddDataSource,
  onManageDataSource,
  onDelete,
}: {
  show: boolean;
  dataSourceConfigs: Record<
    string,
    { dataSource: DataSourceType; selectedResources: Record<string, string> }
  >;
  openDataSourceModal: () => void;
  canAddDataSource: boolean;
  onManageDataSource: (name: string) => void;
  onDelete?: (name: string) => void;
}) {
  return (
    <Transition
      show={show}
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-all duration-300"
      enter="transition-all duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      className="overflow-hidden pt-6"
      afterEnter={() => {
        window.scrollBy({
          left: 0,
          top: 140,
          behavior: "smooth",
        });
      }}
    >
      <div>
        <div className="flex flex-row items-start">
          <div className="text-base font-semibold">Select the data sources</div>
          <div className="flex-grow" />
          {Object.keys(dataSourceConfigs).length > 0 && (
            <Button
              labelVisible={true}
              label="Add a data source"
              variant="primary"
              size="sm"
              icon={PlusIcon}
              onClick={openDataSourceModal}
              disabled={!canAddDataSource}
            />
          )}
        </div>
        {!Object.keys(dataSourceConfigs).length ? (
          <div
            className={classNames(
              "flex h-full min-h-48 items-center justify-center rounded-lg bg-structure-50"
            )}
          >
            <Button
              labelVisible={true}
              label="Add a data source"
              variant="primary"
              size="md"
              icon={PlusIcon}
              onClick={openDataSourceModal}
              disabled={!canAddDataSource}
            />
          </div>
        ) : (
          <ul className="mt-6">
            {Object.entries(dataSourceConfigs).map(
              ([key, { dataSource, selectedResources }]) => {
                const selectedParentIds = Object.keys(selectedResources);
                return (
                  <li key={key} className="px-2 py-4">
                    <SelectedDataSourcesListItem
                      IconComponent={
                        dataSource.connectorProvider
                          ? CONNECTOR_CONFIGURATIONS[
                              dataSource.connectorProvider
                            ].logoComponent
                          : CloudArrowDownIcon
                      }
                      name={
                        dataSource.connectorProvider
                          ? CONNECTOR_CONFIGURATIONS[
                              dataSource.connectorProvider
                            ].name
                          : dataSource.name
                      }
                      description={
                        dataSource.connectorProvider
                          ? `Assistant has access to ${
                              selectedParentIds.length
                            } ${
                              selectedParentIds.length === 1
                                ? CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                                    dataSource.connectorProvider
                                  ].singular
                                : CONNECTOR_PROVIDER_TO_RESOURCE_NAME[
                                    dataSource.connectorProvider
                                  ].plural
                            }`
                          : "Assistant has access to all documents"
                      }
                      buttonProps={
                        dataSource.connectorProvider
                          ? {
                              variant: "secondary",
                              icon: Cog6ToothIcon,
                              label: "Manage",
                              onClick: () => {
                                onManageDataSource(key);
                              },
                            }
                          : {
                              variant: "secondaryWarning",
                              icon: TrashIcon,
                              label: "Remove",
                              onClick: () => onDelete?.(key),
                            }
                      }
                    />
                  </li>
                );
              }
            )}
          </ul>
        )}
      </div>
    </Transition>
  );
}

function SelectedDataSourcesListItem({
  IconComponent,
  name,
  description,
  buttonProps,
}: {
  IconComponent: ComponentType<{ className?: string }>;
  name: string;
  description: string;
  buttonProps: PropsOf<typeof Button>;
}) {
  return (
    <div className="flex items-start">
      <div className="min-w-5 flex">
        <div className="mr-2 flex h-5 w-5 flex-initial sm:mr-4">
          <Icon visual={IconComponent} className="text-slate-400" />
        </div>
        <div className="flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center">
            <span className={classNames("text-sm font-bold text-element-900")}>
              {name}
            </span>
          </div>
          <div className="mt-2 text-sm text-element-700">{description}</div>
        </div>
      </div>
      <div className="flex flex-1" />
      <div>
        <Button {...buttonProps} />
      </div>
    </div>
  );
}
