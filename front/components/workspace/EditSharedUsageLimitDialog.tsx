import { CreditLimitInput } from "@app/components/workspace/CreditLimitInput";
import { useDebounce } from "@app/hooks/useDebounce";
import { useSharedUsageLimitPreview } from "@app/hooks/useSharedUsageLimitPreview";
import { useUpdateGroupSharedUsageLimit } from "@app/hooks/useUpdateGroupSharedUsageLimit";
import { formatCredits } from "@app/lib/client/credits";
import type { SharedUsageLimit } from "@app/types/api/groups/shared_usage_limit";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

export interface EditSharedUsageLimitGroup {
  groupId: string;
  name: string;
  limitAwuCredits: number | null;
}

interface EditSharedUsageLimitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  group: EditSharedUsageLimitGroup | null;
}

export function EditSharedUsageLimitDialog({
  isOpen,
  onClose,
  owner,
  group,
}: EditSharedUsageLimitDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="font-sans">
        {group && (
          <EditSharedUsageLimitForm
            key={group.groupId}
            owner={owner}
            group={group}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function parseLimit(
  input: string,
  removeRequested: boolean
): SharedUsageLimit | null {
  if (removeRequested) {
    return { kind: "unlimited" };
  }
  if (input === "") {
    return null;
  }
  const awuCredits = Number(input);
  return Number.isInteger(awuCredits) ? { kind: "limited", awuCredits } : null;
}

function EditSharedUsageLimitForm({
  owner,
  group,
  onClose,
}: {
  owner: LightWorkspaceType;
  group: EditSharedUsageLimitGroup;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const { inputValue, debouncedValue, isDebouncing, setValue } = useDebounce(
    group.limitAwuCredits === null ? "" : String(group.limitAwuCredits)
  );
  const [removeRequested, setRemoveRequested] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { doUpdateGroupSharedUsageLimit } = useUpdateGroupSharedUsageLimit({
    owner,
  });

  const limit = parseLimit(inputValue, removeRequested);
  const previewedLimit = parseLimit(debouncedValue, removeRequested);
  const { preview, isPreviewLoading } = useSharedUsageLimitPreview({
    owner,
    groupId: group.groupId,
    limit: previewedLimit,
  });

  const isChanged =
    limit !== null &&
    (limit.kind === "unlimited"
      ? group.limitAwuCredits !== null
      : limit.awuCredits !== group.limitAwuCredits);

  const handleSave = async () => {
    if (!limit) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await doUpdateGroupSharedUsageLimit({
        groupId: group.groupId,
        groupName: group.name,
        limit,
      });
      if (saved) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const groupName = group.name;
  const isPreviewPending = isDebouncing || isPreviewLoading;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t`Shared limit for ${groupName}`}</DialogTitle>
        <DialogDescription>
          {t`One amount per billing cycle, shared by the members who draw from this group.`}
        </DialogDescription>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-4">
          <CreditLimitInput
            label={t`Shared limit`}
            value={removeRequested ? "" : inputValue}
            readOnly={removeRequested}
            validationMessage={null}
            onChange={setValue}
          />
          {isPreviewPending && !preview ? (
            <Spinner size="xs" />
          ) : (
            preview && (
              <SharedUsageLimitPreviewDetails
                preview={preview}
                isRemoval={removeRequested}
              />
            )
          )}
        </div>
      </DialogContainer>
      <DialogFooter>
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {group.limitAwuCredits !== null && (
              <Button
                variant="warning"
                label={removeRequested ? t`Confirm removal` : t`Remove limit`}
                disabled={isSaving}
                isLoading={isSaving && removeRequested}
                onClick={
                  removeRequested ? handleSave : () => setRemoveRequested(true)
                }
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              label={t`Cancel`}
              disabled={isSaving}
              onClick={
                removeRequested ? () => setRemoveRequested(false) : onClose
              }
            />
            {!removeRequested && (
              <Button
                variant="highlight"
                label={t`Save`}
                disabled={isSaving || !isChanged}
                isLoading={isSaving}
                onClick={handleSave}
              />
            )}
          </div>
        </div>
      </DialogFooter>
    </>
  );
}

function SharedUsageLimitPreviewDetails({
  preview,
  isRemoval,
}: {
  preview: NonNullable<
    ReturnType<typeof useSharedUsageLimitPreview>["preview"]
  >;
  isRemoval: boolean;
}) {
  const { t } = useLingui();
  const usedCredits = formatCredits(preview.usedAwuCredits);
  const count = preview.membersDrawingElsewhereCount;
  const moreCount = count - preview.membersDrawingElsewhere.length;

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
      <p>
        {preview.usedAwuCredits === 0
          ? t`Usage counts from now.`
          : t`This group already used ${usedCredits} credits this cycle.`}
      </p>
      {isRemoval && (
        <>
          <p>
            {t`Members of this group will no longer draw from this shared limit. Members of another group with a shared limit will draw from that one instead.`}
          </p>
          <p>
            {t`If you set a limit again later, members in several groups may draw from another group first.`}
          </p>
        </>
      )}
      {preview.blocksDrawingMembers && (
        <p className="text-warning-500">
          {t`Members drawing from this group will be blocked right away.`}
        </p>
      )}
      {count > 0 && (
        <div className="flex flex-col gap-1">
          <p>
            {t`${plural(count, {
              one: "# member already draws from another group's shared limit and won't use this one:",
              other:
                "# members already draw from another group's shared limit and won't use this one:",
            })}`}
          </p>
          <ul className="list-disc pl-5">
            {preview.membersDrawingElsewhere.map(({ user, group }) => {
              const userName = user.fullName;
              const otherGroupName = group.name;
              return (
                <li key={user.sId}>{t`${userName} (${otherGroupName})`}</li>
              );
            })}
          </ul>
          {moreCount > 0 && <p>{t`and ${moreCount} more`}</p>}
          <p>
            {t`To have them draw from this group, remove them from the other group.`}
          </p>
        </div>
      )}
    </div>
  );
}
