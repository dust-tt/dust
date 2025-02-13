import { Button, CameraIcon, DocumentPlusIcon } from "@dust-tt/sparkle";
import { useCurrentUrlAndDomain } from "@extension/hooks/useCurrentDomain";
import type { AttachButtonProps } from "@extension/shared/services/platform";

export const ChromeAttachButtons = ({
  isBlinking,
  isLoading,
  fileUploaderService,
  owner,
}: AttachButtonProps) => {
  // Blacklisting logic to disable share buttons.
  const { currentDomain, currentUrl } = useCurrentUrlAndDomain();
  const blacklistedConfig: string[] = owner.blacklistedDomains ?? [];

  const isBlacklisted =
    currentDomain === "chrome" ||
    blacklistedConfig.some((d) =>
      d.startsWith("http://") || d.startsWith("https://")
        ? currentUrl.startsWith(d)
        : currentDomain.endsWith(d)
    );

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
          variant="outline"
          size="sm"
          className={isBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
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
          variant="outline"
          size="sm"
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: false,
              includeCapture: true,
            })
          }
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
          variant="outline"
          size="sm"
          className={isBlinking ? "animate-[bgblink_200ms_3]" : ""}
          onClick={() =>
            fileUploaderService.uploadContentTab({
              includeContent: true,
              includeCapture: false,
            })
          }
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
          variant="outline"
          size="sm"
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
};
