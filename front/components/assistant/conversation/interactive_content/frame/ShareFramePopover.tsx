import { FrameSharingGrants } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingGrants";
import { FrameSharingViewers } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingViewers";
import { Section } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSection";
import { getAvailableScopeOptions } from "@app/components/assistant/conversation/interactive_content/frame/shareFrameScopeOptions";
import type {
  ShareFrameViewerFile,
  ShareFrameViewerFileSourceKind,
} from "@app/lib/api/viz/share_frame_viewer_files";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  useShareInteractiveContentFile,
  useSharingGrants,
} from "@app/lib/swr/files";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { FileShareScope } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Check,
  ContentMessage,
  Cube01,
  File02,
  Icon,
  InfoCircle,
  Label,
  ListGroup,
  ListItem,
  MessageChatSquare,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Spinner,
  Upload01,
  useCopyToClipboard,
} from "@dust-tt/sparkle";
import { useId, useState } from "react";

interface ShareFramePopoverProps {
  fileId: string;
  owner: LightWorkspaceType;
  /** Bursts share/grants cache when frame content changes (e.g. `fileId@updatedAt`). */
  contentHash?: string | null;
}

export function ShareFramePopover({
  fileId,
  owner,
  contentHash,
}: ShareFramePopoverProps) {
  const titleId = useId();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          label={isMobile ? undefined : "Share"}
          tooltip={isMobile ? "Share" : undefined}
          icon={Upload01}
        />
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={8}
        preventAutoFocusOnClose={false}
        className="flex w-80 max-h-(--radix-popover-content-available-height) flex-col overflow-hidden p-2"
      >
        <ShareFramePopoverContent
          fileId={fileId}
          owner={owner}
          contentHash={contentHash}
          titleId={titleId}
          onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}

interface ShareFramePopoverContentProps extends ShareFramePopoverProps {
  titleId: string;
  onClose: () => void;
}

// Radix keeps this content mounted through the exit animation, including its queries.
function ShareFramePopoverContent({
  fileId,
  owner,
  contentHash,
  titleId,
  onClose,
}: ShareFramePopoverContentProps) {
  const { featureFlags } = useFeatureFlags();
  const isDomainSharingEnabled = featureFlags.includes("frame_domain_sharing");
  const [shareBlockError, setShareBlockError] = useState<string[] | null>(null);
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);

  const {
    doShare,
    fileShare,
    isFileShareLoading,
    isFileShareError,
    mutateFileShare,
  } = useShareInteractiveContentFile({
    fileId,
    owner,
    cacheKey: contentHash,
  });

  const {
    sharing,
    isGrantsLoading,
    isGrantsError,
    doAddGrants,
    doRevokeGrant,
    mutateGrants,
  } = useSharingGrants({
    fileId,
    owner,
    cacheKey: contentHash,
  });

  const currentScope: FileShareScope =
    fileShare?.scope ?? "workspace_and_emails";
  const shareURL = fileShare?.shareUrl ?? "";
  const viewerFiles = fileShare?.viewerFiles ?? [];

  const externalSharingDisabledByPolicy =
    owner.sharingPolicy === "workspace_only";

  const { hasPermission } = useWorkspacePermissions();

  const canInviteExternal =
    !externalSharingDisabledByPolicy && hasPermission("invite", "frame");
  const canPublish =
    owner.sharingPolicy === "all_scopes" && hasPermission("publish", "frame");

  const lostPublishPermission = currentScope === "public" && !canPublish;

  const availableScopeOptions = getAvailableScopeOptions({
    sharingPolicy: owner.sharingPolicy,
    canInviteExternal,
    canPublish,
    currentScope,
  });

  const showGrants =
    currentScope === "emails_only" || currentScope === "workspace_and_emails";

  const handleScopeChange = async (scope: FileShareScope) => {
    setShareBlockError(null);
    setIsUpdatingScope(true);
    try {
      const result = await doShare(scope);
      if (!result.success && result.unverifiableRefs?.length) {
        setShareBlockError(result.unverifiableRefs);
      }
    } finally {
      setIsUpdatingScope(false);
    }
  };

  return (
    <>
      <div className="min-h-0 overflow-y-auto">
        {isFileShareLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : isFileShareError || !fileShare ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 py-4"
          >
            <p className="text-sm text-muted-foreground">
              Could not load sharing settings.
            </p>
            <Button
              label="Retry"
              variant="outline"
              onClick={() => {
                void mutateFileShare();
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {!canInviteExternal && (
              <ContentMessage
                icon={InfoCircle}
                variant="info"
                title="Only workspace members can be added"
              >
                {externalSharingDisabledByPolicy
                  ? "Your admin has disabled external sharing. You can only invite people already in your workspace."
                  : "You don’t have permission to invite people outside your workspace. You can only invite people already in your workspace."}
              </ContentMessage>
            )}
            {lostPublishPermission && (
              <ContentMessage
                icon={InfoCircle}
                variant="info"
                title="You no longer have permission to share frames publicly"
              >
                This frame is currently shared publicly. You can restrict
                access, but you won’t be able to make it public again.
              </ContentMessage>
            )}
            {shareBlockError && shareBlockError.length > 0 && (
              <ContentMessage
                icon={InfoCircle}
                variant="warning"
                title="Some referenced files cannot be shared"
              >
                Viewers will only be able to access files you can verify. Fix or
                remove these references before sharing:{" "}
                {shareBlockError.join(", ")}
              </ContentMessage>
            )}
            <AccessScopeSection
              titleId={titleId}
              currentScope={currentScope}
              availableScopeOptions={availableScopeOptions}
              isUpdatingScope={isUpdatingScope}
              onScopeChange={handleScopeChange}
              shareURL={shareURL}
            />

            {showGrants && (
              <FrameSharingGrants
                sharing={sharing}
                canInviteExternal={canInviteExternal}
                canRevoke={hasPermission("invite", "frame")}
                showLastViewedAt={!isDomainSharingEnabled}
                isLoading={isGrantsLoading}
                hasError={!!isGrantsError}
                onAdd={doAddGrants}
                onRevoke={doRevokeGrant}
                onRetry={() => {
                  void mutateGrants();
                }}
              />
            )}
            {isDomainSharingEnabled && (
              <FrameSharingViewers
                viewers={sharing?.viewers}
                isLoading={isGrantsLoading}
                hasError={!!isGrantsError}
                onRetry={() => {
                  void mutateGrants();
                }}
              />
            )}
            <ViewerFilesSection viewerFiles={viewerFiles} />
          </div>
        )}
      </div>
    </>
  );
}

interface AccessScopeSectionProps {
  titleId: string;
  currentScope: FileShareScope;
  availableScopeOptions: ReturnType<typeof getAvailableScopeOptions>;
  isUpdatingScope: boolean;
  onScopeChange: (scope: FileShareScope) => void;
  shareURL: string;
}

function AccessScopeSection({
  titleId,
  currentScope,
  availableScopeOptions,
  isUpdatingScope,
  onScopeChange,
  shareURL,
}: AccessScopeSectionProps) {
  const [isCopied, copyToClipboard] = useCopyToClipboard();

  return (
    <Section
      label={
        <>
          Who has access
          {isUpdatingScope && (
            <span role="status" className="ml-2 inline-flex items-center">
              <span aria-hidden="true">
                <Spinner size="xs" />
              </span>
              <span className="sr-only">Updating sharing settings</span>
            </span>
          )}
        </>
      }
      action={
        <Button
          variant="ghost-secondary"
          size="xs"
          label={isCopied ? "Copied!" : "Copy link"}
          disabled={!shareURL}
          onClick={async () => {
            await copyToClipboard(shareURL);
          }}
        />
      }
    >
      <ListGroup className="overflow-hidden rounded-xl border-x dark:border-border-form">
        {availableScopeOptions.map((option, index) => {
          const isSelected = option.value === currentScope;
          const isDisabled = option.disabled || isUpdatingScope;
          const inputId = `${titleId}-scope-${option.value}`;
          return (
            <Label
              key={option.value}
              htmlFor={inputId}
              className={`block has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-highlight-300 ${
                isDisabled
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer hover:bg-muted-background"
              }`}
            >
              <input
                type="radio"
                id={inputId}
                name={`${titleId}-scope`}
                aria-labelledby={`${inputId}-label`}
                value={option.value}
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => onScopeChange(option.value)}
                className="sr-only"
              />
              <ListItem
                className="gap-2 p-3 dark:border-border-form"
                itemsAlignment="center"
                hasSeparator={index < availableScopeOptions.length - 1}
                hasSeparatorIfLast
              >
                <Icon
                  visual={option.icon}
                  size="xs"
                  className="shrink-0 text-faint"
                />
                <span
                  id={`${inputId}-label`}
                  className="min-w-0 flex-1 label-xs text-muted-foreground"
                >
                  {option.label}
                </span>
                {isSelected && (
                  <Icon
                    visual={Check}
                    size="xs"
                    className="shrink-0 text-muted-foreground"
                  />
                )}
              </ListItem>
            </Label>
          );
        })}
      </ListGroup>
    </Section>
  );
}

const VIEWER_FILE_SOURCE_ICONS: Record<
  ShareFrameViewerFileSourceKind,
  typeof Cube01
> = {
  pod: Cube01,
  conversation: MessageChatSquare,
  workspace: File02,
};

interface ViewerFileLineProps {
  viewerFile: ShareFrameViewerFile;
}

function ViewerFileLine({ viewerFile }: ViewerFileLineProps) {
  const SourceIcon = VIEWER_FILE_SOURCE_ICONS[viewerFile.sourceKind];
  const FileIcon = getFileTypeIcon(viewerFile.contentType, viewerFile.name);

  return (
    <li className="flex min-w-0 items-center gap-1.5 py-0.5 text-xs text-foreground">
      <Icon
        visual={FileIcon}
        size="xs"
        className="shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 items-center gap-1 truncate">
        <span className="shrink-0 font-medium">{viewerFile.name}</span>
        <span className="shrink-0 text-muted-foreground">from</span>
        <Icon
          visual={SourceIcon}
          size="xs"
          className="shrink-0 text-muted-foreground"
        />
        <span className="truncate">{viewerFile.sourceName}</span>
        {viewerFile.pathInSource ? (
          <span className="truncate text-muted-foreground">{`in /${viewerFile.pathInSource}`}</span>
        ) : null}
      </div>
    </li>
  );
}

interface ViewerFilesSectionProps {
  viewerFiles: ShareFrameViewerFile[];
}

function ViewerFilesSection({ viewerFiles }: ViewerFilesSectionProps) {
  if (viewerFiles.length === 0) {
    return null;
  }

  return (
    <Section
      label="Files used"
      description="When shared, viewers can only access these files—not the rest of the conversation or pod."
    >
      <ul className="flex flex-col gap-0">
        {viewerFiles.map((viewerFile) => (
          <ViewerFileLine key={viewerFile.ref} viewerFile={viewerFile} />
        ))}
      </ul>
    </Section>
  );
}
