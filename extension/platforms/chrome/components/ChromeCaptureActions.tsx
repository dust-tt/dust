import { Button, CameraIcon, DocumentPlusIcon } from "@dust-tt/sparkle";
import { useCurrentUrlAndDomain } from "@extension/platforms/chrome/hooks/useCurrentDomain";
import type { CaptureActionsProps } from "@extension/shared/services/platform";

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

  const handleCaptureText = () => {
    void fileUploaderService.uploadContentTab({
      includeContent: true,
      includeCapture: false,
    });
  };

  const handleCaptureScreenshot = () => {
    void fileUploaderService.uploadContentTab({
      includeContent: false,
      includeCapture: true,
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
          onClick={handleCaptureText}
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
          onClick={handleCaptureScreenshot}
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
          onClick={handleCaptureText}
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
          onClick={handleCaptureScreenshot}
          disabled={isLoading || isBlacklisted}
        />
      </div>
    </>
  );
}
