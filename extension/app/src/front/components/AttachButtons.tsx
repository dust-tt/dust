import { Button, ChatBubbleBottomCenterPlusIcon } from "@dust-tt/sparkle";
import { useCaptureService } from "@extension/front/hooks/useCaptureService";
import type { AttachButtonProps } from "@extension/shared/services/platform";

export const FrontAttachButtons = ({
  isBlinking,
  isLoading,
  fileUploaderService,
}: AttachButtonProps) => {
  const captureService = useCaptureService();

  if (!captureService) {
    return null;
  }

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
};
