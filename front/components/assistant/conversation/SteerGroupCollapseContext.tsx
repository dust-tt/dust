import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface SteerGroupCollapseContextType {
  isGroupCollapsed: (groupId: string) => boolean;
  toggleGroup: (groupId: string) => void;
}

const SteerGroupCollapseContext =
  createContext<SteerGroupCollapseContextType | null>(null);

/**
 * Provider for shared collapse state across steered agent message groups.
 * Groups default to collapsed — streaming messages opt out of group collapse.
 */
export function SteerGroupCollapseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Groups not in the map are collapsed by default (true).
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const isGroupCollapsed = useCallback(
    (groupId: string) => !expandedGroups.has(groupId),
    [expandedGroups]
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ isGroupCollapsed, toggleGroup }),
    [isGroupCollapsed, toggleGroup]
  );

  return (
    <SteerGroupCollapseContext.Provider value={value}>
      {children}
    </SteerGroupCollapseContext.Provider>
  );
}

/**
 * Hook to access shared collapse state for a steer group.
 * Returns null when not in a steer group (component should use local state).
 */
export function useSteerGroupCollapse(steerGroupId: string | null): {
  isCollapsed: boolean;
  toggle: () => void;
} | null {
  const context = useContext(SteerGroupCollapseContext);

  if (!steerGroupId || !context) {
    return null;
  }

  return {
    isCollapsed: context.isGroupCollapsed(steerGroupId),
    toggle: () => context.toggleGroup(steerGroupId),
  };
}
