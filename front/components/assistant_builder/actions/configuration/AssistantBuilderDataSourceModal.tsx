import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDataSourceViewsContext } from "@app/components/assistant_builder/contexts/DataSourceViewsContext";
import { useSpacesContext } from "@app/components/assistant_builder/contexts/SpacesContext";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import {
  isRemoteDatabase,
  supportsDocumentsData,
  supportsStructuredData,
} from "@app/lib/data_sources";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  WorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";

interface AssistantBuilderDataSourceModalProps {
  initialDataSourceConfigurations: DataSourceViewSelectionConfigurations;
  isOpen: boolean;
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
  owner: WorkspaceType;
  setOpen: (isOpen: boolean) => void;
  viewType: ContentNodesViewType;
}

export default function AssistantBuilderDataSourceModal({
  initialDataSourceConfigurations,
  isOpen,
  onSave,
  owner,
  setOpen,
  viewType,
}: AssistantBuilderDataSourceModalProps) {
  const { dataSourceViews } = useDataSourceViewsContext();
  const { spaces } = useSpacesContext();
  const [hasChanged, setHasChanged] = useState(false);

  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(
      initialDataSourceConfigurations
    );

  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  useEffect(() => {
    if (isOpen) {
      setSelectionConfigurations(initialDataSourceConfigurations);
    }
  }, [isOpen, initialDataSourceConfigurations]);

  useNavigationLock(true, {
    title: "Warning",
    message:
      "All unsaved changes will be lost, are you sure you want to continue?",
    validation: "primaryWarning",
  });

  const setSelectionConfigurationsCallback = useCallback(
    (func: SetStateAction<DataSourceViewSelectionConfigurations>) => {
      setHasChanged(true);
      setSelectionConfigurations(func);
    },
    [setSelectionConfigurations]
  );

  const supportedDataSourceViewsForViewType = useMemo(() => {
    switch (viewType) {
      case "all":
        return dataSourceViews;
      case "table":
        return dataSourceViews.filter((dsv) =>
          supportsStructuredData(dsv.dataSource)
        );
      case "data_warehouse":
        // For data_warehouse view, only show remote databases.
        return dataSourceViews.filter((dsv) =>
          isRemoteDatabase(dsv.dataSource)
        );
      case "document":
        return dataSourceViews.filter((dsv) =>
          supportsDocumentsData(dsv.dataSource, featureFlags)
        );
      default:
        assertNever(viewType);
    }
  }, [dataSourceViews, viewType, featureFlags]);

  const selectedTableCount = useMemo(() => {
    if (viewType !== "table" && viewType !== "data_warehouse") {
      return null;
    }
    return Object.values(selectionConfigurations).reduce((acc, curr) => {
      return acc + curr.selectedResources.length;
    }, 0);
  }, [selectionConfigurations, viewType]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setOpen(false);
        }
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Manage data sources selection</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div
            id="dataSourceViewsSelector"
            className="overflow-y-auto scrollbar-hide"
          >
            <DataSourceViewsSpaceSelector
              useCase="assistantBuilder"
              dataSourceViews={supportedDataSourceViewsForViewType}
              owner={owner}
              selectionConfigurations={selectionConfigurations}
              setSelectionConfigurations={setSelectionConfigurationsCallback}
              viewType={viewType}
              isRootSelectable={true}
              allowedSpaces={spaces}
            />
          </div>
        </SheetContainer>
        {selectedTableCount !== null && (
          <div className="flex flex-col border-t border-border/60 bg-background p-3 text-sm dark:border-border-night/60 dark:bg-background-night">
            {selectedTableCount} items selected.
          </div>
        )}
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
            onClick: () => {
              onSave(selectionConfigurations);
              setOpen(false);
            },
            disabled: !hasChanged,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
