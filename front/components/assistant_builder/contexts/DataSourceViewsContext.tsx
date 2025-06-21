import React, { createContext, memo, useContext, type ReactNode } from "react";

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
    const {
      dataSourceViews,
      isDataSourceViewsLoading,
      isDataSourceViewsError,
    } = useDataSourceViews(owner);

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
