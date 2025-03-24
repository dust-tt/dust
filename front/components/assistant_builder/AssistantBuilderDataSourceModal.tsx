import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import type { SetStateAction } from "react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { useNavigationLock } from "@app/components/assistant_builder/useNavigationLock";
import { DataSourceViewsSpaceSelector } from "@app/components/data_source_view/DataSourceViewsSpaceSelector";
import {
  supportsDocumentsData,
  supportsStructuredData,
} from "@app/lib/data_sources";
import type {
  ContentNodesViewType,
  DataSourceViewSelectionConfigurations,
  SpaceType,
  WorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";

interface AssistantBuilderDataSourceModalProps {
  initialDataSourceConfigurations: DataSourceViewSelectionConfigurations;
  allowedSpaces: SpaceType[];
  isOpen: boolean;
  onSave: (dsConfigs: DataSourceViewSelectionConfigurations) => void;
  owner: WorkspaceType;
  setOpen: (isOpen: boolean) => void;
  viewType: ContentNodesViewType;
}

export default function AssistantBuilderDataSourceModal({
  initialDataSourceConfigurations,
  allowedSpaces,
  isOpen,
  onSave,
  owner,
  setOpen,
  viewType,
}: AssistantBuilderDataSourceModalProps) {
  const { dataSourceViews } = useContext(AssistantBuilderContext);
  const [hasChanged, setHasChanged] = useState(false);

  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>(
      initialDataSourceConfigurations
    );

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
      case "document":
        return dataSourceViews.filter((dsv) =>
          supportsDocumentsData(dsv.dataSource)
        );
      default:
        assertNever(viewType);
    }
  }, [dataSourceViews, viewType]);

  const selectedTableCount = useMemo(() => {
    if (viewType !== "table") {
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
      <SheetContent size="xl">
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
              allowedSpaces={allowedSpaces}
              owner={owner}
              selectionConfigurations={selectionConfigurations}
              setSelectionConfigurations={setSelectionConfigurationsCallback}
              viewType={viewType}
              isRootSelectable={true}
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
