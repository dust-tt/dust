import { useState } from "react";

export function useSearchPageState<Filter>({
  tabs,
  initialFilter,
}: {
  tabs: { id: string }[];
  initialFilter: Filter;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState(tabs[0].id);
  const [filter, setFilter] = useState(initialFilter);
  const [showHiddenAgents, setShowHiddenAgents] = useState(false);

  return {
    searchTerm,
    setSearchTerm,
    selectedTab,
    setSelectedTab,
    filter,
    setFilter,
    showHiddenAgents,
    setShowHiddenAgents,
  };
}
