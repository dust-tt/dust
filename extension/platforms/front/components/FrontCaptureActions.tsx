import type { CaptureActionsProps } from "@app/shared/services/platform";
import { Button, ChatBubbleBottomCenterPlusIcon } from "@dust-tt/sparkle";

export function FrontCaptureActions({
  fileUploaderService,
  isBlinking,
  isLoading,
}: CaptureActionsProps) {
  return (
    <div>
      <Button
        icon={ChatBubbleBottomCenterPlusIcon}
        label="Include conversation"
        tooltip="Add conversation content"
        variant="outline"
        className={isBlinking ? "animate-[bgblink_200ms_3]" : ""}
        size="sm"
        onClick={async () => {
          await fileUploaderService.uploadContentTab({
            includeContent: true,
            includeCapture: false,
          });
        }}
        disabled={isLoading}
      />
    </div>
  );
}
