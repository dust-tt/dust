import {
  Button,
  CloudArrowDownIcon,
  Cog6ToothIcon,
  ContextItem,
  DropdownMenu,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { Transition } from "@headlessui/react";

import { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/AssistantBuilder";
import {
  CONNECTOR_PROVIDER_TO_RESOURCE_NAME,
  TIME_FRAME_MODE_TO_LABEL,
  TIME_FRAME_UNIT_TO_LABEL,
  TimeFrameMode,
} from "@app/components/assistant_builder/shared";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { classNames } from "@app/lib/utils";
import { TimeframeUnit } from "@app/types/assistant/actions/retrieval";

export default function DataSourceSelectionSection({
  show,
  dataSourceConfigurations,
  openDataSourceModal,
  canAddDataSource,
  onManageDataSource,
  onDelete,
  timeFrameMode,
  setTimeFrameMode,
  timeFrame,
  setTimeFrame,
  timeFrameError,
}: {
  show: boolean;
  dataSourceConfigurations: Record<
    string,
    AssistantBuilderDataSourceConfiguration
  >;
  openDataSourceModal: () => void;
  canAddDataSource: boolean;
  onManageDataSource: (name: string) => void;
  onDelete?: (name: string) => void;
  timeFrameMode: TimeFrameMode;
  setTimeFrameMode: (timeFrameMode: TimeFrameMode) => void;
  timeFrame: { value: number; unit: TimeframeUnit };
  setTimeFrame: (timeframe: { value: number; unit: TimeframeUnit }) => void;
  timeFrameError: string | null;
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
          <div className="pb-3 text-sm font-bold">Select the Data Sources:</div>
          <div className="flex-grow" />
          {Object.keys(dataSourceConfigurations).length > 0 && (
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
        {!Object.keys(dataSourceConfigurations).length ? (
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
          <ContextItem.List className="mt-6">
            {Object.entries(dataSourceConfigurations).map(
              ([key, { dataSource, selectedResources, isSelectAll }]) => {
                const selectedParentIds = Object.keys(selectedResources);
                return (
                  <ContextItem
                    key={key}
                    title={
                      dataSource.connectorProvider
                        ? CONNECTOR_CONFIGURATIONS[dataSource.connectorProvider]
                            .name
                        : dataSource.name
                    }
                    visual={
                      <ContextItem.Visual
                        visual={
                          dataSource.connectorProvider
                            ? CONNECTOR_CONFIGURATIONS[
                                dataSource.connectorProvider
                              ].logoComponent
                            : CloudArrowDownIcon
                        }
                      />
                    }
                    action={
                      <Button.List>
                        <Button
                          icon={TrashIcon}
                          variant="secondaryWarning"
                          label="Remove"
                          labelVisible={false}
                          onClick={() => {
                            onDelete?.(key);
                          }}
                        />
                        <Button
                          variant="secondary"
                          icon={Cog6ToothIcon}
                          label="Manage"
                          size="sm"
                          onClick={() => {
                            onManageDataSource(key);
                          }}
                          disabled={dataSource.connectorProvider === null}
                        />
                      </Button.List>
                    }
                  >
                    <ContextItem.Description
                      description={
                        dataSource.connectorProvider && !isSelectAll
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
                    />
                  </ContextItem>
                );
              }
            )}
          </ContextItem.List>
        )}
      </div>
      <div>
        <div className="flex flex-row items-center space-x-2 pt-4">
          <div className="text-sm font-semibold text-element-900">
            Timeframe:
          </div>
          <DropdownMenu>
            <DropdownMenu.Button>
              <Button
                type="select"
                labelVisible={true}
                label={TIME_FRAME_MODE_TO_LABEL[timeFrameMode]}
                variant="secondary"
                size="sm"
              />
            </DropdownMenu.Button>
            <DropdownMenu.Items origin="bottomRight">
              {Object.entries(TIME_FRAME_MODE_TO_LABEL).map(([key, value]) => (
                <DropdownMenu.Item
                  key={key}
                  label={value}
                  onClick={() => {
                    setTimeFrameMode(key as TimeFrameMode);
                  }}
                />
              ))}
            </DropdownMenu.Items>
          </DropdownMenu>
        </div>
        <div className="mt-4">
          <Transition
            show={timeFrameMode === "CUSTOM"}
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-all duration-300"
            enter="transition-all duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            className=""
            afterEnter={() => {
              window.scrollBy({
                left: 0,
                top: 70,
                behavior: "smooth",
              });
            }}
          >
            <div className={"flex flex-row items-center gap-4 pb-4"}>
              <div className="text-sm font-semibold text-element-900">
                Focus on the last
              </div>
              <input
                type="text"
                className={classNames(
                  "h-8 w-16 rounded-md border-gray-300 text-center text-sm",
                  !timeFrameError
                    ? "focus:border-action-500 focus:ring-action-500"
                    : "border-red-500 focus:border-red-500 focus:ring-red-500",
                  "bg-structure-50 stroke-structure-50"
                )}
                value={timeFrame.value || ""}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value) || !e.target.value) {
                    setTimeFrame({
                      value,
                      unit: timeFrame.unit,
                    });
                  }
                }}
              />
              <DropdownMenu>
                <DropdownMenu.Button tooltipPosition="above">
                  <Button
                    type="select"
                    labelVisible={true}
                    label={TIME_FRAME_UNIT_TO_LABEL[timeFrame.unit]}
                    variant="secondary"
                    size="sm"
                  />
                </DropdownMenu.Button>
                <DropdownMenu.Items origin="bottomLeft">
                  {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(
                    ([key, value]) => (
                      <DropdownMenu.Item
                        key={key}
                        label={value}
                        onClick={() => {
                          setTimeFrame({
                            value: timeFrame.value,
                            unit: key as TimeframeUnit,
                          });
                        }}
                      />
                    )
                  )}
                </DropdownMenu.Items>
              </DropdownMenu>
            </div>
          </Transition>
        </div>
        <div className="text-sm font-normal text-element-700">
          You can filter the documents retrieved for a&nbsp;specific
          time&nbsp;period.
          <br />
          When <span className="italic">“Auto”</span> is selected,
          the&nbsp;assistant will determine the&nbsp;timeframe from
          the&nbsp;instructions and the&nbsp;question being&nbsp;asked.
        </div>
      </div>
    </Transition>
  );
}
