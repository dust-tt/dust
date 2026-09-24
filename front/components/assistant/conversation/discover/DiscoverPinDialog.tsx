import type { CatalogItem } from "@app/components/assistant/conversation/discover/catalog";
import {
  getItemId,
  getItemName,
} from "@app/components/assistant/conversation/discover/catalog";
import { getSkillAvatarIcon } from "@app/lib/skill";
import {
  useGroupDiscoveryPins,
  usePinDiscoveryItem,
} from "@app/lib/swr/discovery";
import { useGroups } from "@app/lib/swr/groups";
import type { DiscoveryItemType } from "@app/types/api/discovery";
import type { GroupType } from "@app/types/groups";
import { USER_VISIBLE_GROUP_KINDS } from "@app/types/groups";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  cn,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

const PIN_POSITIONS = [0, 1, 2];

function getAudienceName(group: GroupType): string {
  return group.kind === "global" ? "Everyone" : group.name;
}

interface DiscoverPinDialogProps {
  owner: WorkspaceType;
  item: CatalogItem;
  onClose: () => void;
}

export function DiscoverPinDialog({
  owner,
  item,
  onClose,
}: DiscoverPinDialogProps) {
  const { groups } = useGroups({ owner, kinds: USER_VISIBLE_GROUP_KINDS });
  const audiences = [
    ...groups.filter((g) => g.kind === "global"),
    ...groups.filter((g) => g.kind !== "global"),
  ];
  const [selectedGroup, setSelectedGroup] = useState<GroupType | null>(null);
  const group = selectedGroup ?? audiences[0] ?? null;
  const [position, setPosition] = useState(0);
  const { doPin, isPinning } = usePinDiscoveryItem({ workspaceId: owner.sId });

  const name = getItemName(item);

  const onPin = async () => {
    if (!group) {
      return;
    }
    const pinned = await doPin({
      groupId: group.sId,
      position,
      type: item.kind,
      itemId: getItemId(item),
      itemName: name,
      audienceName: getAudienceName(group),
    });
    if (pinned) {
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Pin <span className="notranslate">{name}</span> to Featured
          </DialogTitle>
          <DialogDescription>
            It will show at the top of Discover for the audience you pick.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="heading-sm text-foreground">Show to</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    label={group ? getAudienceName(group) : "Loading…"}
                    isSelect
                    disabled={!group}
                    className="w-fit"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel label="Audience" />
                  {audiences.map((g) => (
                    <DropdownMenuItem
                      key={g.sId}
                      label={getAudienceName(g)}
                      onClick={() => setSelectedGroup(g)}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {group && (
              <PinPositions
                owner={owner}
                groupId={group.sId}
                position={position}
                onPositionChange={setPosition}
              />
            )}
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Pin",
            variant: "highlight",
            disabled: !group,
            isLoading: isPinning,
            onClick: (event) => {
              event.preventDefault();
              void onPin();
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface PinPositionsProps {
  owner: WorkspaceType;
  groupId: string;
  position: number;
  onPositionChange: (position: number) => void;
}

function PinPositions({
  owner,
  groupId,
  position,
  onPositionChange,
}: PinPositionsProps) {
  const { groupPins, isGroupPinsLoading, isGroupPinsRefreshing } =
    useGroupDiscoveryPins({
      workspaceId: owner.sId,
      groupId,
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="heading-sm text-foreground">Position</span>
        {isGroupPinsRefreshing && <Spinner size="xs" />}
      </div>
      <div
        role="radiogroup"
        aria-label="Position in Featured"
        className="grid grid-cols-3 gap-3"
      >
        {PIN_POSITIONS.map((i) => {
          const current = groupPins.find((p) => p.pin.position === i);
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={position === i}
              aria-label={`Position ${i + 1}`}
              onClick={() => onPositionChange(i)}
              className={cn(
                "flex h-20 flex-col items-center justify-center gap-1 rounded-xl border px-2",
                "transition-[color,background-color,border-color,scale] duration-150 ease-emphasized",
                "active:scale-[0.97] motion-reduce:active:scale-100",
                position === i
                  ? "border-highlight-500 bg-highlight-50 text-highlight-700"
                  : "border-border bg-background text-muted-foreground hover:bg-hover"
              )}
            >
              {isGroupPinsLoading ? (
                <Spinner size="xs" />
              ) : current ? (
                <>
                  <PinnedItemAvatar pinnedItem={current} />
                  <span className="copy-xs w-full truncate">
                    {current.target.name}
                  </span>
                </>
              ) : (
                <span className="heading-lg">{i + 1}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PinnedItemAvatarProps {
  pinnedItem: DiscoveryItemType;
}

function PinnedItemAvatar({ pinnedItem }: PinnedItemAvatarProps) {
  if (pinnedItem.type === "agent") {
    return <Avatar size="xs" visual={pinnedItem.target.pictureUrl} />;
  }
  return <PinnedSkillAvatar icon={pinnedItem.target.icon} />;
}

interface PinnedSkillAvatarProps {
  icon: string | null;
}

function PinnedSkillAvatar({ icon }: PinnedSkillAvatarProps) {
  const SkillAvatar = useMemo(() => getSkillAvatarIcon(icon), [icon]);
  return <SkillAvatar size="xs" />;
}
