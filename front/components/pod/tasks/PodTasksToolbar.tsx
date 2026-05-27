import { PodTaskLocalSearch } from "@app/components/pod/tasks/PodTaskLocalSearch";
import { PodTaskScopeFilter } from "@app/components/pod/tasks/PodTaskScopeFilter";

/** Single row: scope filter · search. */
export function PodTasksToolbar() {
  return (
    <div className="flex items-center gap-2">
      <div className="shrink-0">
        <PodTaskScopeFilter />
      </div>
      <div className="min-w-0 flex-1">
        <PodTaskLocalSearch />
      </div>
    </div>
  );
}
