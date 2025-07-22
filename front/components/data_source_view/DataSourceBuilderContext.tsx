import { get, set, unset } from "lodash";
import { createContext, useCallback, useContext, useState } from "react";

type DataSourceBuilderNode = {
  excludes?: string[];
  childs?: DataSourceBuilderNode;
};

type DataSourceBuilderState = {
  nodes: Record<string, DataSourceBuilderNode>;

  addNode: (path: string[]) => void;
  removeNode: (path: string[]) => void;
  isSelected: (path: string[]) => boolean;
};

const DataSourceBuilderContext = createContext<
  DataSourceBuilderState | undefined
>(undefined);

export function DataSourceBuilderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [nodes, setNodes] = useState<Record<string, DataSourceBuilderNode>>({});

  const addNode = useCallback((path: string[]) => {
    setNodes((prev) => {
      const newState = { ...prev };
      const leaf = path[path.length - 1];

      const parentPath = replaceDotsWithChilds(
        path.slice(0, path.length - 1).join(".")
      );
      const parent = get(newState, parentPath);

      // If node is only in excludes, we remove it from it
      if (parent?.excludes?.includes(leaf)) {
        set(
          newState,
          parentPath + ".excludes",
          (parent.excludes ?? []).filter((path) => path !== leaf)
        );
      } else {
        // Otherwise we can add it a new node
        set(newState, replaceDotsWithChilds(path.join(".")), { excludes: [] });
      }

      return newState;
    });
  }, []);

  const removeNode = useCallback((path: string[]) => {
    setNodes((prev) => {
      const leaf: string = path[path.length - 1];
      const newState = { ...prev };
      // path without parent
      const parentPath = replaceDotsWithChilds(
        path.slice(0, path.length - 1).join(".")
      );
      const node = get(newState, parentPath);

      if (node) {
        if (node.childs && leaf in node.childs) {
          // delete node.childs[leaf];
          unset(newState, parentPath + ".childs." + leaf);
        } else {
          if (!node.excludes) {
            node.excludes = [];
          }
          node.excludes.push(leaf);
        }

        if (node.childs && Object.keys(node.childs).length <= 0) {
          delete node.childs;
        }

        // If everything is empty for the parent node, we remove it
        if (
          (!node.childs || Object.keys(node.childs).length <= 0) &&
          (!node.excludes || node.excludes.length <= 0)
        ) {
          unset(newState, parentPath);
        }
      } else {
        set(newState, parentPath, { excludes: [path[path.length - 1]] });
      }

      return newState;
    });
  }, []);

  const isSelected = useCallback(
    (path: string[]) => {
      for (let i = path.length - 1; i >= 0; i--) {
        const sections = path.slice(0, i);
        const pp = replaceDotsWithChilds(sections.join("."));
        const node = get(nodes, pp);
        const leaf = path[path.length - 1];

        // We're in the first parent, it's present if it isn't in the excludes
        // or it's in the childs
        if (node && i === path.length - 1) {
          // It selected if the parent has no childs and no excludes
          if (
            node.excludes &&
            node.excludes.length <= 0 &&
            Object.keys(node.childs ?? {}).length <= 0
          ) {
            return true;
          }

          // OR
          // it's not in the excludes or in the childs
          if (node.excludes?.includes(leaf)) {
            return false;
          }

          if (Object.keys(node.childs ?? {}).includes(leaf)) {
            return true;
          }
          return Object.keys(node.childs ?? {}).length <= 0;
        }
      }
      return false;
    },
    [nodes]
  );

  return (
    <DataSourceBuilderContext.Provider
      value={{
        nodes,
        addNode,
        removeNode,
        isSelected,
      }}
    >
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

function replaceDotsWithChilds(input: string): string {
  return input.replace(/\./g, ".childs.");
}
