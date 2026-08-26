import {
  MAX_INACTIVITY_THRESHOLD_DAYS,
  MIN_INACTIVITY_THRESHOLD_DAYS,
} from "@app/lib/api/assistant/inactivity/policy";
import {
  useArchiveInactiveAgents,
  usePreviewInactiveAgents,
} from "@app/lib/swr/assistants";
import type { PreviewInactiveAgentsResponseBody } from "@app/types/api/assistant/configuration";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { useState } from "react";

// What the picker starts from when the workspace has set no threshold of its own.
export const DEFAULT_INACTIVITY_THRESHOLD_DAYS = 90;

type Preview = PreviewInactiveAgentsResponseBody["preview"];

interface ArchiveUnusedAgentsFormProps {
  onClose: () => void;
  owner: LightWorkspaceType;
  initialThresholdDays: number;
  onArchived: () => void;
}

function ArchiveUnusedAgentsForm({
  onClose,
  owner,
  initialThresholdDays,
  onArchived,
}: Readonly<ArchiveUnusedAgentsFormProps>) {
  const previewInactiveAgents = usePreviewInactiveAgents({ owner });
  const archiveInactiveAgents = useArchiveInactiveAgents({ owner });

  const [thresholdDays, setThresholdDays] = useState(
    String(initialThresholdDays)
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const parsedThresholdDays = Number(thresholdDays);
  const isThresholdValid =
    Number.isInteger(parsedThresholdDays) &&
    parsedThresholdDays >= MIN_INACTIVITY_THRESHOLD_DAYS &&
    parsedThresholdDays <= MAX_INACTIVITY_THRESHOLD_DAYS;

  const step = preview === null ? "pick" : "review";

  // The server reports every reason it skipped an agent for, but a schedule is the only one that is worth showing
  const activeScheduleCount =
    preview?.skippedCountByReason.active_schedule ?? 0;

  const onPreview = async () => {
    setIsPreviewing(true);
    setPreview(await previewInactiveAgents(parsedThresholdDays));
    setIsPreviewing(false);
  };

  const onArchive = async () => {
    setIsArchiving(true);
    const archived = await archiveInactiveAgents(parsedThresholdDays);
    setIsArchiving(false);

    if (archived) {
      onArchived();
      onClose();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Archive unused agents</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {step === "pick"
            ? "Choose how long an agent has to go unmentioned to be archived."
            : "Review what would be archived before archiving it."}
        </p>
      </DialogHeader>
      <DialogContainer>
        {step === "pick" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-row items-start gap-4">
              <Input
                name="inactivity-threshold-days"
                label="Unmentioned for"
                value={thresholdDays}
                onChange={(e) => setThresholdDays(e.target.value)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                size="sm"
                className="w-32"
                containerClassName="w-auto shrink-0"
                suffix="days"
                disabled={isPreviewing}
                message={
                  isThresholdValid
                    ? undefined
                    : `Between ${MIN_INACTIVITY_THRESHOLD_DAYS} and ${MAX_INACTIVITY_THRESHOLD_DAYS}`
                }
                messageStatus="error"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Nothing is archived until you have seen the count. Agents with a
              schedule are excluded.
            </p>
          </div>
        ) : (
          preview && (
            <div className="flex flex-col gap-3 text-sm text-foreground">
              <span className="font-semibold">
                {preview.eligibleCount > 0
                  ? `${preview.eligibleCount} agent${pluralize(preview.eligibleCount)} would be archived`
                  : "No agent would be archived"}
              </span>
              <span className="text-muted-foreground">
                {preview.eligibleCount > 0
                  ? `Nobody has mentioned them since ${new Date(preview.cutoffAt).toDateString()}.`
                  : `No agent has gone unmentioned since ${new Date(preview.cutoffAt).toDateString()}.`}
              </span>
              {activeScheduleCount > 0 && (
                <span className="text-muted-foreground">
                  {activeScheduleCount} agent{pluralize(activeScheduleCount)}{" "}
                  with a schedule. Agents with a schedule are excluded from
                  archival.
                </span>
              )}
              {preview.eligibleCount > 0 && (
                <span className="text-muted-foreground">
                  Archiving will cancel their pending runs and suspend their
                  editors&apos; access. It can be undone one agent at a time.
                </span>
              )}
            </div>
          )
        )}
      </DialogContainer>
      <DialogFooter>
        <Button
          label={step === "pick" ? "Cancel" : "Back"}
          variant="outline"
          disabled={isArchiving}
          onClick={step === "pick" ? onClose : () => setPreview(null)}
        />
        {step === "pick" ? (
          <Button
            label="Preview"
            variant="primary"
            disabled={!isThresholdValid || isPreviewing}
            isLoading={isPreviewing}
            onClick={() => void onPreview()}
          />
        ) : (
          <Button
            label="Archive them"
            variant="warning"
            disabled={isArchiving || preview?.eligibleCount === 0}
            isLoading={isArchiving}
            onClick={() => void onArchive()}
          />
        )}
      </DialogFooter>
    </>
  );
}

interface ArchiveUnusedAgentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  initialThresholdDays: number;
  onArchived: () => void;
}
/**
 * Picks a threshold, shows what archiving it would take, and archives only from that answer. The
 * dry run is the same read the nightly run does, so the second step states the real number.
 */
export function ArchiveUnusedAgentsModal({
  isOpen,
  onClose,
  owner,
  initialThresholdDays,
  onArchived,
}: Readonly<ArchiveUnusedAgentsModalProps>) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        {isOpen && (
          <ArchiveUnusedAgentsForm
            onClose={onClose}
            owner={owner}
            initialThresholdDays={initialThresholdDays}
            onArchived={onArchived}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
