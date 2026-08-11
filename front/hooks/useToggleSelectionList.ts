import { useCallback, useState } from "react";

// Generic add/remove state for an unordered list of unique items, so a
// category-specific control (e.g. a group filter) doesn't need its own
// useState + add/remove handler pair.
export function useToggleSelectionList<T extends { id: string }>() {
  const [items, setItems] = useState<T[]>([]);

  const add = useCallback((item: T) => {
    setItems((current) =>
      current.some((i) => i.id === item.id) ? current : [...current, item]
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((i) => i.id !== id));
  }, []);

  return { items, add, remove, setItems };
}
