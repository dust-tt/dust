import { usePodTasksPanel } from "@app/components/pod/tasks/PodTasksPanelContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { SearchInput } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

/** Keeps keystrokes out of panel context — only debounced updates reach the task tables. */
export function PodTaskLocalSearch() {
  const { t } = useLingui();
  const { setDebouncedTaskSearchQuery } = usePodTasksPanel();

  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 200,
  });

  useEffect(() => {
    setDebouncedTaskSearchQuery(debouncedValue);
  }, [debouncedValue, setDebouncedTaskSearchQuery]);

  return (
    <SearchInput
      name="project-tasks-filter"
      placeholder={t`Filter tasks...`}
      value={inputValue}
      onChange={setValue}
      className="w-full"
    />
  );
}
