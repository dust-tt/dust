import { getSpaceIcon } from "@app/lib/spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import type { PodType } from "@app/types/space";
import { isProjectType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useState } from "react";

interface TriggerPodSelectorProps {
  owner: LightWorkspaceType;
  value: string | null | undefined;
  onChange: (spaceId: string | null) => void;
  disabled?: boolean;
}

export function TriggerPodSelector({
  owner,
  value,
  onChange,
  disabled,
}: TriggerPodSelectorProps) {
  const { t } = useLingui();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["project"],
  });

  const allPods = useMemo(
    () =>
      spaces
        .filter((s) => isProjectType(s))
        .filter((s) => s.archivedAt === null),
    [spaces]
  );

  const selectedPod = useMemo(
    () => (value ? allPods.find((pod) => pod.sId === value) : undefined),
    [value, allPods]
  );

  const filteredPods = useMemo(() => {
    if (!searchQuery.trim()) {
      return allPods;
    }
    const query = searchQuery.toLowerCase();
    return allPods.filter(
      (pod) =>
        pod.name.toLowerCase().includes(query) ||
        pod.description?.toLowerCase().includes(query)
    );
  }, [allPods, searchQuery]);

  const handleSelectPod = useCallback(
    (pod: PodType | null) => {
      onChange(pod ? pod.sId : null);
      setSearchOpen(false);
      setSearchQuery("");
    },
    [onChange]
  );

  return (
    <div className="inline-flex">
      <DropdownMenu open={searchOpen} onOpenChange={setSearchOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            label={selectedPod?.name ?? t`My conversations (default)`}
            icon={selectedPod ? getSpaceIcon(selectedPod) : undefined}
            variant="outline"
            size="xs"
            isSelect
            disabled={disabled}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          dropdownHeaders={
            <DropdownMenuSearchbar
              name="pod-search"
              placeholder={t`Search...`}
              value={searchQuery}
              onChange={setSearchQuery}
              autoFocus
            />
          }
        >
          <DropdownMenuItem
            label={t`My conversations (default)`}
            description={t`Run in my conversations.`}
            onClick={() => handleSelectPod(null)}
          />
          {isSpacesLoading ? (
            <div className="px-3 py-4 text-center text-xs italic text-muted-foreground">
              <Trans>Loading...</Trans>
            </div>
          ) : filteredPods.length > 0 ? (
            filteredPods.map((pod) => (
              <DropdownMenuItem
                key={pod.sId}
                onClick={() => handleSelectPod(pod)}
                label={pod.name}
                description={
                  pod.description
                    ? pod.description.length > 50
                      ? `${pod.description.substring(0, 50)}...`
                      : pod.description
                    : t`No description available.`
                }
                icon={getSpaceIcon(pod)}
              />
            ))
          ) : (
            <div className="px-3 py-4 text-center text-xs italic text-muted-foreground">
              {searchQuery ? t`No matches` : t`No Pods`}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
