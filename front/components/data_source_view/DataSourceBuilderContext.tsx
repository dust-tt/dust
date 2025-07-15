import type { RowSelectionState } from "@tanstack/react-table";
import { createContext, useContext, useReducer } from "react";

import type { SpaceType } from "@app/types";

type SpaceTypeForm = SpaceType & {
  nodes: { id: string; excludes: string[] }[];
};

export type DataSourceBuilderContextState = {
  spaces: Record<string, SpaceTypeForm>;
};

type DataSourceBuilderContextAction =
  | {
      type: "set-spaces";
      payload: Record<string, SpaceType>;
    }
  | {
      type: "set-nodes";
      payload: {
        prefix: string;
        rowSelectionState: RowSelectionState;
      };
    };

type DataSourceBuilderContextDispatch = (
  action: DataSourceBuilderContextAction
) => void;

const DataSourceBuilderContext = createContext<
  | {
      state: DataSourceBuilderContextState;
      dispatch: DataSourceBuilderContextDispatch;
    }
  | undefined
>(undefined);

function dataSourceContextReducer(
  state: DataSourceBuilderContextState,
  action: DataSourceBuilderContextAction
): DataSourceBuilderContextState {
  switch (action.type) {
    case "set-spaces": {
      return {
        ...state,
        spaces: mergeSpaces(state.spaces, action.payload),
      };
    }
    case "set-nodes":
      return state;
  }
}

export function DataSourceBuilderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(dataSourceContextReducer, {
    spaces: {},
  });

  return (
    <DataSourceBuilderContext.Provider value={{ state, dispatch }}>
      {children}
    </DataSourceBuilderContext.Provider>
  );
}

export function useDataSourceBuilderContext() {
  const context = useContext(DataSourceBuilderContext);
  if (!context) {
    throw new Error(
      `useDataSourceBuilderContext must be used within DataSourceBuilderProvider`
    );
  }
  return context;
}

// Actions helpers

/**
 * Function to get the new state of selected spaces.
 * If a `newSpaces` space is also part of `currentStateSpaces`, we keep its selected nodes.
 */
function mergeSpaces(
  currentStateSpaces: DataSourceBuilderContextState["spaces"],
  newSpaces: Record<string, SpaceType>
): DataSourceBuilderContextState["spaces"] {
  const spaces: DataSourceBuilderContextState["spaces"] = {};

  for (const [id, newSpace] of Object.entries(newSpaces)) {
    const currentSpace = currentStateSpaces[id];
    if (currentSpace) {
      spaces[id] = currentSpace;
    } else {
      spaces[id] = {
        ...newSpace,
        nodes: [],
      };
    }
  }

  return spaces;
}
