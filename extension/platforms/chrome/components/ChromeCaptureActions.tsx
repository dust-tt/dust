import { useCurrentUrlAndDomain } from "@app/platforms/chrome/hooks/useCurrentDomain";
import type { CaptureActionsProps } from "@app/shared/services/platform";
import { Button, CameraIcon, DocumentPlusIcon } from "@dust-tt/sparkle";

export function ChromeCaptureActions({
  fileUploaderService,
  isBlinking,
  isLoading,
  owner,
}: CaptureActionsProps) {
  const { currentDomain, currentUrl } = useCurrentUrlAndDomain();
  const blacklistedConfig: string[] = owner.blacklistedDomains ?? [];

  const isBlacklisted =
    currentDomain === "chrome" ||
    blacklistedConfig.some((d) =>
      d.startsWith("http://") || d.startsWith("https://")
        ? currentUrl.startsWith(d)
        : currentDomain.endsWith(d)
    );

  const handleCapture = () => {
    void fileUploaderService.uploadContentTab({
      includeContent: true,
      includeCapture: false,
    });
  };

  const handleCapturePageContent = () => {
    void fileUploaderService.uploadContentTab({
      includeContent: true,
      includeCapture: false,
    });
  };

  return (
    <>
      <div className="block sm:hidden">
        <Button
          icon={DocumentPlusIcon}
          tooltip={
            !isBlacklisted
              ? "Attach text from page"
              : "Attachment disabled on this website"
          }
          variant="ghost-secondary"
          size="xs"
          className={isBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={handleCapture}
          disabled={isLoading || isBlacklisted}
        />
      </div>
      <div className="block sm:hidden">
        <Button
          icon={CameraIcon}
          tooltip={
            !isBlacklisted
              ? "Attach page screenshot"
              : "Attachment disabled on this website"
          }
          variant="ghost-secondary"
          size="xs"
          onClick={handleCapturePageContent}
          disabled={isLoading || isBlacklisted}
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={DocumentPlusIcon}
          label="Add page text"
          tooltip={
            !isBlacklisted
              ? "Attach text from page"
              : "Attachment disabled on this website"
          }
          variant="ghost-secondary"
          size="xs"
          className={isBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={handleCapture}
          disabled={isLoading || isBlacklisted}
        />
      </div>
      <div className="hidden sm:block">
        <Button
          icon={CameraIcon}
          label="Add page screenshot"
          tooltip={
            !isBlacklisted
              ? "Attach page screenshot"
              : "Attachment disabled on this website"
          }
          variant="ghost-secondary"
          size="xs"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
          disabled={isLoading || isBlacklisted}
        />
      </div>
    </>
  );
}
