import type { ReactNode } from "react";
import React, { createContext, memo, useContext, useEffect } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useDataSourceViews } from "@app/lib/swr/data_source_views";
import type { DataSourceViewType, LightWorkspaceType } from "@app/types";

interface DataSourceViewsContextType {
  dataSourceViews: DataSourceViewType[];
  isDataSourceViewsLoading: boolean;
  isDataSourceViewsError: boolean;
}

const DataSourceViewsContext = createContext<DataSourceViewsContextType>({
  dataSourceViews: [],
  isDataSourceViewsLoading: false,
  isDataSourceViewsError: false,
});

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

export const DataSourceViewsProvider = memo(
  ({ owner, children }: DataSourceViewsProviderProps) => {
    const sendNotification = useSendNotification();
    const {
      dataSourceViews,
      isDataSourceViewsLoading,
      isDataSourceViewsError,
    } = useDataSourceViews(owner);

    useEffect(() => {
      if (isDataSourceViewsError) {
        sendNotification({
          type: "error",
          title: "Failed to load data sources",
          description: "Unable to fetch data source views. Please try again.",
        });
      }
    }, [isDataSourceViewsError, sendNotification]);

    const value: DataSourceViewsContextType = {
      dataSourceViews,
      isDataSourceViewsLoading,
      isDataSourceViewsError,
    };

    return (
      <DataSourceViewsContext.Provider value={value}>
        {children}
      </DataSourceViewsContext.Provider>
    );
  }
);

DataSourceViewsProvider.displayName = "DataSourceViewsProvider";
