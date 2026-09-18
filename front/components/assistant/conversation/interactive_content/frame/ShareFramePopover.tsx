import { FrameSharingFiles } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingFiles";
import { FrameSharingGrants } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingGrants";
import { FrameSharingViewers } from "@app/components/assistant/conversation/interactive_content/frame/FrameSharingViewers";
import { Section } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSection";
import {
  getAvailableScopeOptions,
  SHARE_SCOPE_ICONS,
} from "@app/components/assistant/conversation/interactive_content/frame/shareFrameScopeOptions";
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
  Icon,
  Label,
  ListGroup,
  ListItem,
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

/**
 * @cc [owner:flvndvd,label:product] share-button-scope-icon
 * When sharing settings load or change, the trigger MUST use the same icon as
 * the corresponding access option.
 */
export function ShareFramePopover({
  fileId,
  owner,
  contentHash,
}: ShareFramePopoverProps) {
  const titleId = useId();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  // The visible trigger needs the sharing scope even when the popover is closed.
  const fileSharing = useShareInteractiveContentFile({
    fileId,
    owner,
    cacheKey: contentHash,
  });
  const { fileShare, isFileShareLoading } = fileSharing;

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          label={isMobile ? undefined : "Share"}
          tooltip={isMobile ? "Share" : undefined}
          icon={fileShare ? SHARE_SCOPE_ICONS[fileShare.scope] : Upload01}
          isLoading={isFileShareLoading}
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
        <span id={titleId} className="sr-only">
          Share this frame
        </span>
        <ShareFramePopoverContent
          fileId={fileId}
          owner={owner}
          contentHash={contentHash}
          titleId={titleId}
          fileSharing={fileSharing}
        />
      </PopoverContent>
    </PopoverRoot>
  );
}

interface ShareFramePopoverContentProps extends ShareFramePopoverProps {
  titleId: string;
  fileSharing: ReturnType<typeof useShareInteractiveContentFile>;
}

// Radix keeps this content mounted through the exit animation, including its queries.
function ShareFramePopoverContent({
  fileId,
  owner,
  contentHash,
  titleId,
  fileSharing,
}: ShareFramePopoverContentProps) {
  const [shareBlockError, setShareBlockError] = useState<string[] | null>(null);
  const [isUpdatingScope, setIsUpdatingScope] = useState(false);

  const {
    doShare,
    fileShare,
    isFileShareLoading,
    isFileShareError,
    mutateFileShare,
  } = fileSharing;

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
                variant="info"
                title="Only workspace members can be added"
                size="sm"
              >
                {externalSharingDisabledByPolicy
                  ? "Your admin has disabled external sharing. You can only invite people already in your workspace."
                  : "You don’t have permission to invite people outside your workspace. You can only invite people already in your workspace."}
              </ContentMessage>
            )}
            {lostPublishPermission && (
              <ContentMessage
                title="You no longer have permission to share frames publicly"
                size="sm"
              >
                This frame is currently shared publicly. You can restrict
                access, but you won’t be able to make it public again.
              </ContentMessage>
            )}
            {shareBlockError && shareBlockError.length > 0 && (
              <ContentMessage
                variant="warning"
                title="Some referenced files cannot be shared"
                size="sm"
              >
                Viewers will only be able to access files you can verify. Fix or
                remove these references before sharing:{" "}
                {shareBlockError.join(", ")}
              </ContentMessage>
            )}
            <FrameSharingFiles viewerFiles={viewerFiles} />
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
                isLoading={isGrantsLoading}
                hasError={!!isGrantsError}
                onAdd={doAddGrants}
                onRevoke={doRevokeGrant}
                onRetry={() => {
                  void mutateGrants();
                }}
              />
            )}
            <FrameSharingViewers
              viewers={sharing?.viewers}
              isLoading={isGrantsLoading}
              hasError={!!isGrantsError}
              onRetry={() => {
                void mutateGrants();
              }}
            />
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
        <span className="flex items-center">
          Who has access
          {isUpdatingScope && (
            <span role="status" className="ml-2 inline-flex items-center">
              <span aria-hidden="true">
                <Spinner size="xs" />
              </span>
              <span className="sr-only">Updating sharing settings</span>
            </span>
          )}
        </span>
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
