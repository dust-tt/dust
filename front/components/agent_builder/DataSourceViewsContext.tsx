import type { ReactNode } from "react";
import React, { createContext, useContext, useEffect, useMemo } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import {
  supportsDocumentsData,
  supportsStructuredData,
} from "@app/lib/data_sources";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { DataSourceViewType, LightWorkspaceType } from "@app/types";

interface DataSourceViewsContextType {
  supportedDataSourceViews: DataSourceViewType[];
  isDataSourceViewsLoading: boolean;
  isDataSourceViewsError: boolean;
}

const DataSourceViewsContext = createContext<
  DataSourceViewsContextType | undefined
>(undefined);

export const useDataSourceViewsContext = () => {
  const context = useContext(DataSourceViewsContext);
  if (!context) {
    throw new Error(
      "useDataSourceViewsContext must be used within a DataSourceViewsProvider"
    );
  }
  return context;
};

interface DataSourceViewsProviderProps {
  owner: LightWorkspaceType;
  children: ReactNode;
}

export const DataSourceViewsProvider = ({
  owner,
  children,
}: DataSourceViewsProviderProps) => {
  const sendNotification = useSendNotification();
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const { dataSourceViews, isDataSourceViewsLoading, isDataSourceViewsError } =
    useDataSourceViews(owner);

  useEffect(() => {
    if (isDataSourceViewsError) {
      sendNotification({
        type: "error",
        title: "Failed to load data sources",
        description: "Unable to fetch data source views. Please try again.",
      });
    }
  }, [isDataSourceViewsError, sendNotification]);

  const supportedDataSourceViews = useMemo(() => {
    return dataSourceViews.filter(
      (dsv) =>
        supportsDocumentsData(dsv.dataSource, featureFlags) ||
        supportsStructuredData(dsv.dataSource)
    );
  }, [dataSourceViews, featureFlags]);

  const value: DataSourceViewsContextType = useMemo(
    () => ({
      supportedDataSourceViews,
      isDataSourceViewsLoading,
      isDataSourceViewsError,
    }),
    [supportedDataSourceViews, isDataSourceViewsLoading, isDataSourceViewsError]
  );

  return (
    <DataSourceViewsContext.Provider value={value}>
      {children}
    </DataSourceViewsContext.Provider>
  );
};

DataSourceViewsProvider.displayName = "DataSourceViewsProvider";
