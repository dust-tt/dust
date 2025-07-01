import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ActionIncludeIcon,
  Button,
  Checkbox,
  classNames,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  MultiPageSheet,
  MultiPageSheetContent,
  TextArea,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type {
  AgentBuilderAction,
  IncludeDataAgentBuilderAction,
} from "@app/components/agent_builder/types";
import { isIncludeDataAction } from "@app/components/agent_builder/types";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import logger from "@app/logger/logger";
import type {
  DataSourceViewSelectionConfigurations,
  TimeFrame,
} from "@app/types";

const TIME_FRAME_UNITS = ["hour", "day", "week", "month", "year"] as const;

const TIME_FRAME_UNIT_TO_LABEL: Record<TimeFrame["unit"], string> = {
  hour: "hour(s)",
  day: "day(s)",
  week: "week(s)",
  month: "month(s)",
  year: "year(s)",
};

function isTimeFrameUnit(unit: string): unit is TimeFrame["unit"] {
  return (TIME_FRAME_UNITS as readonly string[]).includes(unit);
}

const DEFAULT_TIME_FRAME: TimeFrame = { duration: 1, unit: "day" };

const PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  CONFIGURATION: "configuration",
} as const;

type PageId = (typeof PAGE_IDS)[keyof typeof PAGE_IDS];

function isValidPageId(pageId: string): pageId is PageId {
  return Object.values(PAGE_IDS).includes(pageId as PageId);
}

interface AddIncludeDataSheetProps {
  onSave: (action: AgentBuilderAction) => void;
  isOpen: boolean;
  onClose: () => void;
  action?: AgentBuilderAction;
}

const getDataSourceConfigurations = (
  action?: AgentBuilderAction
): DataSourceViewSelectionConfigurations => {
  if (!action || !isIncludeDataAction(action)) {
    return {};
  }
  return action.configuration.dataSourceConfigurations;
};

const getTimeFrame = (action?: AgentBuilderAction): TimeFrame | null => {
  if (!action || !isIncludeDataAction(action)) {
    return null;
  }
  return action.configuration.timeFrame;
};

export function AddIncludeDataSheet({
  onSave,
  isOpen,
  onClose,
  action,
}: AddIncludeDataSheetProps) {
  const { owner, supportedDataSourceViews } = useAgentBuilderContext();
  const { spaces } = useSpacesContext();

  const [currentPageId, setCurrentPageId] = useState<PageId>(
    PAGE_IDS.DATA_SOURCE_SELECTION
  );
  const [description, setDescription] = useState(action?.description ?? "");
  const [dataSourceConfigurations, setDataSourceConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(() =>
      getDataSourceConfigurations(action)
    );
  const [timeFrame, setTimeFrame] = useState<TimeFrame | null>(() =>
    getTimeFrame(action)
  );

  useEffect(() => {
    setDescription(action?.description ?? "");
    setDataSourceConfigurations(getDataSourceConfigurations(action));
    setTimeFrame(getTimeFrame(action));
  }, [action]);

  const handleClose = useCallback(() => {
    onClose();
    setDescription("");
    setDataSourceConfigurations({});
    setTimeFrame(null);
    setCurrentPageId(PAGE_IDS.DATA_SOURCE_SELECTION);
  }, [onClose]);

  const hasDataSourceSelections = useMemo(() => {
    return Object.keys(dataSourceConfigurations).length > 0;
  }, [dataSourceConfigurations]);

  const handleSave = useCallback(() => {
    const includeDataAction: IncludeDataAgentBuilderAction = {
      id: action?.id || `include_data_${Date.now()}`,
      type: "INCLUDE_DATA",
      name: "Include Data",
      description,
      configuration: {
        type: "INCLUDE_DATA",
        dataSourceConfigurations,
        timeFrame,
      },
      noConfigurationRequired: false,
    };
    onSave(includeDataAction);
    handleClose();
  }, [
    action?.id,
    description,
    dataSourceConfigurations,
    timeFrame,
    onSave,
    handleClose,
  ]);

  const handlePageChange = useCallback((pageId: string) => {
    if (isValidPageId(pageId)) {
      setCurrentPageId(pageId);
    } else {
      logger.warn({ pageId }, "Invalid page ID received");
    }
  }, []);

  const pages: MultiPageSheetPage[] = useMemo(
    () => [
      {
        id: PAGE_IDS.DATA_SOURCE_SELECTION,
        title: "Select Data Sources",
        description: "Choose which data sources to include data from",
        icon: ActionIncludeIcon,
        content: (
          <div className="space-y-4">
            <div
              id="dataSourceViewsSelector"
              className="overflow-y-auto scrollbar-hide"
            >
              <DataSourceViewsSpaceSelector
                useCase="assistantBuilder"
                dataSourceViews={supportedDataSourceViews}
                allowedSpaces={spaces}
                owner={owner}
                selectionConfigurations={dataSourceConfigurations}
                setSelectionConfigurations={setDataSourceConfigurations}
                viewType="document"
                isRootSelectable={true}
              />
            </div>
          </div>
        ),
      },
      {
        id: PAGE_IDS.CONFIGURATION,
        title: "Configure Include Data",
        description: "Set time range and describe what data to include",
        icon: ActionIncludeIcon,
        content: (
          <div className="space-y-6">
            {/* Time Range Configuration */}
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-lg font-semibold">
                  Time Range Configuration
                </h3>
                <p className="text-sm text-muted-foreground">
                  By default, the time frame is determined automatically based
                  on the conversation context. Enable manual time frame
                  selection when you need to specify an exact range for data
                  inclusion.
                </p>
              </div>

              <div className="flex flex-row items-center gap-4 pb-4">
                <Checkbox
                  checked={!!timeFrame}
                  onCheckedChange={(checked) => {
                    setTimeFrame(checked ? DEFAULT_TIME_FRAME : null);
                  }}
                />
                <div
                  className={classNames(
                    "text-sm font-semibold",
                    !timeFrame
                      ? "text-muted-foreground dark:text-muted-foreground-night"
                      : "text-foreground dark:text-foreground-night"
                  )}
                >
                  Include data from the last
                </div>
                <Input
                  name="timeFrameDuration"
                  type="number"
                  min="1"
                  value={timeFrame?.duration.toString() ?? ""}
                  onChange={(e) => {
                    const duration = Math.max(
                      1,
                      parseInt(e.target.value, 10) || 1
                    );
                    setTimeFrame({
                      ...(timeFrame || DEFAULT_TIME_FRAME),
                      duration,
                    });
                  }}
                  disabled={!timeFrame}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      isSelect
                      label={TIME_FRAME_UNIT_TO_LABEL[timeFrame?.unit ?? "day"]}
                      variant="outline"
                      size="sm"
                      disabled={!timeFrame}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(
                      ([key, value]) => (
                        <DropdownMenuItem
                          key={key}
                          label={value}
                          onClick={() => {
                            if (isTimeFrameUnit(key)) {
                              setTimeFrame(
                                timeFrame
                                  ? { ...timeFrame, unit: key }
                                  : { ...DEFAULT_TIME_FRAME, unit: key }
                              );
                            }
                          }}
                        />
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Description Configuration */}
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 text-lg font-semibold">Data Description</h3>
                <p className="text-sm text-muted-foreground">
                  Describe what type of data you want to include from your
                  selected data sources to provide context to the agent.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <TextArea
                  placeholder="Describe what data you want to include from your selected data sources..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This description helps the agent understand what type of data
                  to include as context.
                </p>
              </div>
            </div>
          </div>
        ),
      },
    ],
    [
      supportedDataSourceViews,
      spaces,
      owner,
      dataSourceConfigurations,
      timeFrame,
      description,
    ]
  );

  return (
    <MultiPageSheet
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
    >
      <MultiPageSheetContent
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={handlePageChange}
        size="lg"
        onSave={handleSave}
        showNavigation={true}
        disableNext={
          currentPageId === PAGE_IDS.DATA_SOURCE_SELECTION &&
          !hasDataSourceSelections
        }
        disableSave={!hasDataSourceSelections || !description.trim()}
      />
    </MultiPageSheet>
  );
}
