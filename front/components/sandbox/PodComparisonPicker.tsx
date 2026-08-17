import { getSpaceIcon } from "@app/lib/spaces";
import type { PodType } from "@app/types/space";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface PodComparisonPickerProps {
  pods: PodType[];
  selectedPodIds: string[];
  onChange: (podIds: string[]) => void;
  isLoading: boolean;
  disabled?: boolean;
}

// Multi-select of Pods to compare against the workspace baseline on the
// central Computer admin page. Emits the selected Pod sIds.
export function PodComparisonPicker({
  pods,
  selectedPodIds,
  onChange,
  isLoading,
  disabled = false,
}: PodComparisonPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const selected = useMemo(() => new Set(selectedPodIds), [selectedPodIds]);

  const filteredPods = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return query
      ? pods.filter((pod) => pod.name.toLowerCase().includes(query))
      : pods;
  }, [searchText, pods]);

  const label =
    selectedPodIds.length === 0
      ? "Select Pods"
      : selectedPodIds.length === 1
        ? (pods.find((pod) => pod.sId === selectedPodIds[0])?.name ?? "1 Pod")
        : `${selectedPodIds.length} Pods`;

  const toggle = (podId: string, checked: boolean) => {
    onChange(
      checked
        ? [...selectedPodIds, podId]
        : selectedPodIds.filter((id) => id !== podId)
    );
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" label={label} isSelect disabled={disabled} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 max-w-[calc(100vw-1rem)]"
        align="start"
        collisionPadding={8}
      >
        <DropdownMenuSearchbar
          autoFocus
          name="search-pods"
          placeholder="Search Pods"
          value={searchText}
          onChange={setSearchText}
          disabled={isLoading}
        />
        {isLoading ? (
          <DropdownMenuItem
            label="Loading"
            disabled
            endComponent={<Spinner size="xs" />}
          />
        ) : pods.length === 0 ? (
          <DropdownMenuItem label="No Pods in this workspace" disabled />
        ) : filteredPods.length === 0 ? (
          <DropdownMenuItem label="No matching Pods" disabled />
        ) : (
          filteredPods.map((pod) => (
            <DropdownMenuCheckboxItem
              key={pod.sId}
              label={pod.name}
              icon={getSpaceIcon(pod)}
              checked={selected.has(pod.sId)}
              onCheckedChange={(checked) => toggle(pod.sId, checked === true)}
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
