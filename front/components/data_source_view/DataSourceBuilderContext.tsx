import type { RowSelectionState } from "@tanstack/react-table";
import { createContext, useContext, useReducer } from "react";

import type { SpaceType } from "@app/types";
import { removeNulls } from "@app/types";

type SpaceTypeForm = SpaceType & {
  /**
   * Selected node under a space.
   * Can be a category or a straight node.
   * The key represent a path, can be `folder.[folderId]` or `managed.[managedId].[folderId]`
   * And the values are the excluded sub folder, one level deep in the given path.
   */
  nodes: Record<string, string[]>;
  excludedPath: string[];
};

export type DataSourceBuilderContextState = {
  spaces: Record<string, SpaceTypeForm>;
};

type ActionSetSpacePayload = Record<string, SpaceType>;
type ActionSetNodesPayload = {
  spaceId: string;
  path?: string;
  rowSelectionState: RowSelectionState;
};

type DataSourceBuilderContextAction =
  | {
      type: "set-spaces";
      payload: ActionSetSpacePayload;
    }
  | {
      type: "set-nodes";
      payload: ActionSetNodesPayload;
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
      return {
        ...state,
        spaces: {
          [action.payload.spaceId]: {
            ...state.spaces[action.payload.spaceId],
            ...computeNewSelectedNodes(state.spaces, action.payload),
          },
        },
      };
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
        nodes: {},
        excludedPath: [],
      };
    }
  }

  return spaces;
}

function computeNewSelectedNodes(
  spaces: Record<string, SpaceTypeForm>,
  { spaceId, path, rowSelectionState }: ActionSetNodesPayload
): Pick<SpaceTypeForm, "nodes" | "excludedPath"> {
  const space = spaces[spaceId];
  const nodes: Record<string, string[]> = {};
  const excludedPath: string[] = [];

  console.log("Current nodes", space.nodes);

  for (const [id, selected] of Object.entries(rowSelectionState)) {
    const fullPath = removeNulls([path, id]).join(".");
    const existingNode = space?.nodes[fullPath];

    // Node is still selected and it existing so we keep the excluded paths
    if (selected && existingNode) {
      nodes[fullPath] = existingNode;
    } else if (selected && !existingNode) {
      nodes[fullPath] = [];
    } else {
      excludedPath.push(fullPath);
    }
  }

  // Clean node that might have been deleted
  for (const existingNode of Object.keys(space.nodes)) {
    if (!rowSelectionState[existingNode]) {
      excludedPath.push(existingNode);
    }
  }

  const res = { nodes, excludedPath };
  console.log("Result", res);
  return res;
}
