import { DataSourceViewsSelector } from "@app/components/data_source_view/DataSourceViewSelector";
import { useMultipleDataSourceViewsContentNodes } from "@app/lib/swr/data_source_views";
import { emptyArray } from "@app/lib/swr/swr";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { SetStateAction } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Capture the selection snapshot when the modal opens and keep it stable while open,
// even if the parent props refresh from SWR revalidation.
function useStabilizedValue<T>(
  initialValue: T,
  isOpen: boolean,
  defaultValue: T
): T {
  const [value, setValue] = useState<T | undefined>();

  useLayoutEffect(() => {
    if (isOpen && value === undefined) {
      setValue(initialValue);
    } else if (!isOpen) {
      setValue(undefined);
    }
  }, [isOpen, initialValue, value]);

  if (!isOpen) {
    return defaultValue;
  }

  return value ?? initialValue;
}

interface SpaceManagedDataSourcesViewsModalProps {
  initialSelectedDataSources: DataSourceViewType[];
  isOpen: boolean;
  isRootSelectable?: boolean;
  onClose: () => void;
  onSave: (
    selectionConfigurations: DataSourceViewSelectionConfigurations
  ) => void | Promise<void | boolean>;
  owner: WorkspaceType;
  systemSpaceDataSourceViews: DataSourceViewType[];
  space: SpaceType;
  systemSpace: SpaceType;
  title?: string;
}

export default function SpaceManagedDataSourcesViewsModal({
  initialSelectedDataSources,
  isOpen,
  isRootSelectable = true,
  onClose,
  onSave,
  owner,
  systemSpaceDataSourceViews,
  space,
  systemSpace,
  title,
}: SpaceManagedDataSourcesViewsModalProps) {
  const defaultSelectedDataSources = useStabilizedValue(
    initialSelectedDataSources,
    isOpen,
    emptyArray()
  );

  const [systemDataSourceViews, spaceDataSourceViews] = useMemo(() => {
    const [systemDataSourceViews, spaceDataSourceViews]: Record<
      string,
      DataSourceViewType
    >[] = [{}, {}];
    defaultSelectedDataSources.forEach((dsv) => {
      systemDataSourceViews[dsv.dataSource.sId] =
        systemSpaceDataSourceViews.find(
          (sdsv) => sdsv.dataSource.sId === dsv.dataSource.sId
        ) ?? dsv;
      spaceDataSourceViews[dsv.dataSource.sId] = dsv;
    });
    return [systemDataSourceViews, spaceDataSourceViews];
  }, [defaultSelectedDataSources, systemSpaceDataSourceViews]);

  const dataSourceViewsAndInternalIds = useMemo(
    () =>
      defaultSelectedDataSources.map((dsv) => ({
        // We are selecting from the system dataSourceView and fetching the nodes from there,
        // so we need to find the corresponding one in the systemSpaceDataSourceViews
        dataSourceView: systemDataSourceViews[dsv.dataSource.sId],
        internalIds: dsv.parentsIn ?? [],
      })),
    [defaultSelectedDataSources, systemDataSourceViews]
  );

  const initialConfigurations = useMultipleDataSourceViewsContentNodes({
    dataSourceViewsAndInternalIds,
    owner,
    viewType: "all",
  });

  const [selectionConfigurations, setSelectionConfigurations] =
    useState<DataSourceViewSelectionConfigurations>({});

  const [hasChanged, setHasChanged] = useState(false);
  const initializedForKeyRef = useRef<string | null>(null);
  const [selectorKey, setSelectorKey] = useState(0);
  const wasOpenRef = useRef(isOpen);

  useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setSelectorKey((key) => key + 1);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const initializationKey = useMemo(
    () =>
      JSON.stringify(
        dataSourceViewsAndInternalIds.map(
          ({ dataSourceView, internalIds }) => ({
            dsvId: dataSourceView.sId,
            internalIds: internalIds.toSorted(),
          })
        )
      ),
    [dataSourceViewsAndInternalIds]
  );

  const showInitialLoading =
    dataSourceViewsAndInternalIds.length > 0 &&
    initialConfigurations.dataSourceViewsAndNodes.length === 0 &&
    !initialConfigurations.isNodesError;

  useEffect(() => {
    if (isOpen) {
      initialConfigurations.refetch();
    }
  }, [isOpen, initialConfigurations.refetch]);

  useEffect(() => {
    if (!isOpen) {
      initializedForKeyRef.current = null;
      setHasChanged(false);
      setSelectionConfigurations({});
      return;
    }

    if (initializedForKeyRef.current === initializationKey) {
      return;
    }

    // Wait for useStabilizedValue to populate before treating "no selections" as final.
    if (
      initialSelectedDataSources.length > 0 &&
      dataSourceViewsAndInternalIds.length === 0
    ) {
      return;
    }

    // Wait until content nodes have been fetched (isNodesLoading is false before fetch starts).
    if (
      dataSourceViewsAndInternalIds.length > 0 &&
      initialConfigurations.dataSourceViewsAndNodes.length === 0
    ) {
      return;
    }

    if (initialConfigurations.isNodesError) {
      return;
    }

    if (dataSourceViewsAndInternalIds.length === 0) {
      initializedForKeyRef.current = initializationKey;
      setSelectionConfigurations({});
      return;
    }

    const converted = initialConfigurations.dataSourceViewsAndNodes.reduce(
      (acc, config) => {
        const dataSourceView =
          spaceDataSourceViews[config.dataSourceView.dataSource.sId];
        if (!dataSourceView) {
          return acc;
        }

        const isSelectAll = dataSourceView.parentsIn === null;
        const selectedResources = isSelectAll ? [] : config.nodes;

        acc[config.dataSourceView.sId] = {
          dataSourceView: config.dataSourceView,
          selectedResources,
          excludedResources: [],
          isSelectAll,
          tagsFilter: null,
        };
        return acc;
      },
      {} as DataSourceViewSelectionConfigurations
    );

    initializedForKeyRef.current = initializationKey;
    setSelectionConfigurations(converted);
  }, [
    isOpen,
    initializationKey,
    initialSelectedDataSources.length,
    dataSourceViewsAndInternalIds.length,
    initialConfigurations.isNodesError,
    initialConfigurations.dataSourceViewsAndNodes,
    spaceDataSourceViews,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const setSelectionConfigurationsCallback = useCallback(
    (func: SetStateAction<DataSourceViewSelectionConfigurations>) => {
      setHasChanged(true);
      setSelectionConfigurations(func);
    },
    [setSelectionConfigurations]
  );

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          // This is required to avoid a stale state when closing and reopening the modal.
          // Before, we used SWR, so we had invalidation for free, but now we need to do it manually.
          initialConfigurations.invalidate();
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            {title ?? `Add connected data to space "${space.name}"`}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer
          noScroll
          isListSelector
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {showInitialLoading ? (
            <div className="flex items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <DataSourceViewsSelector
              key={selectorKey}
              useCase="spaceDatasourceManagement"
              dataSourceViews={systemSpaceDataSourceViews}
              owner={owner}
              selectionConfigurations={selectionConfigurations}
              setSelectionConfigurations={setSelectionConfigurationsCallback}
              viewType="all"
              isRootSelectable={isRootSelectable}
              space={systemSpace}
              allowAdminSearch={isAdmin(owner)}
              fixedSearchLayout
              focusSearchOnOpen={isOpen}
            />
          )}
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Save",
            onClick: () => {
              void (async () => {
                const result = await onSave(selectionConfigurations);
                if (result !== false) {
                  onClose();
                }
              })();
            },
            disabled: !hasChanged,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
