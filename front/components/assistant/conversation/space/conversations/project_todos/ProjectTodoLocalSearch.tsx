import { useProjectTodosPanel } from "@app/components/assistant/conversation/space/conversations/project_todos/ProjectTodosPanelContext";
import { useDebounce } from "@app/hooks/useDebounce";
import { SearchInput } from "@dust-tt/sparkle";
import { useEffect } from "react";

/** Keeps keystrokes out of panel context — only debounced updates reach the todo tables. */
export function ProjectTodoLocalSearch() {
  const { setDebouncedTodoSearchQuery } = useProjectTodosPanel();

  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 200,
  });

  useEffect(() => {
    setDebouncedTodoSearchQuery(debouncedValue);
  }, [debouncedValue, setDebouncedTodoSearchQuery]);

  return (
    <SearchInput
      name="project-todos-filter"
      placeholder="Filter to-dos..."
      value={inputValue}
      onChange={setValue}
      className="w-full"
    />
  );
}
