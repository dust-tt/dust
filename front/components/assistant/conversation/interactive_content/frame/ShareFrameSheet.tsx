import { useAwaitableDialog } from "@app/hooks/useAwaitableDialog";
import type {
  ShareFrameViewerFile,
  ShareFrameViewerFileSourceKind,
} from "@app/lib/api/viz/share_frame_viewer_files";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  useShareInteractiveContentFile,
  useSharingGrants,
} from "@app/lib/swr/files";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { isEmailValid } from "@app/lib/utils";
import {
  type FileShareScope,
  MAX_EMAILS_PER_INVITE,
  type SharingGrantType,
} from "@app/types/files";
import type {
  LightWorkspaceType,
  WorkspaceSharingPolicy,
} from "@app/types/user";
import {
  Avatar,
  Button,
  Clipboard,
  ClipboardCheck,
  ContentMessage,
  ContextItem,
  Cube01,
  File02,
  Globe01,
  Icon,
  IconButton,
  InfoCircle,
  Input,
  Label,
  Lock01,
  MessageChatSquare,
  ScrollArea,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  Upload01,
  Users01,
  useCopyToClipboard,
  XClose,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { intlFormatDistance } from "date-fns";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

function getScopeOptions(sharingPolicy: WorkspaceSharingPolicy): {
  icon: typeof Lock01;
  label: string;
  description: string;
  value: FileShareScope;
}[] {
  const externalOff = sharingPolicy === "workspace_only";
  return [
    {
      icon: Lock01,
      label: externalOff ? "Invited members only" : "Invite only",
      description: externalOff
        ? "Only the workspace members you invite"
        : "Only the people you invite",
      value: "emails_only",
    },
    {
      icon: Users01,
      label: externalOff
        ? "All workspace members + invited members"
        : "All workspace members + invites",
      description: externalOff
        ? "Everyone in your workspace, plus members you invite individually"
        : "Everyone in your workspace, plus anyone you invite",
      value: "workspace_and_emails",
    },
    {
      icon: Globe01,
      label: "Anyone with the link",
      description: "No sign-in required",
      value: "public",
    },
  ];
}

// Scopes allowed by each workspace sharing policy.
const ALLOWED_SCOPES_BY_POLICY: Record<
  WorkspaceSharingPolicy,
  FileShareScope[]
> = {
  workspace_only: ["emails_only", "workspace_and_emails"],
  workspace_and_emails: ["emails_only", "workspace_and_emails"],
  all_scopes: ["emails_only", "workspace_and_emails", "public"],
};

const inviteFormSchema = z.object({
  emailsRaw: z
    .string()
    .min(1)
    .superRefine((val, ctx) => {
      const emails = val
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      if (emails.length > MAX_EMAILS_PER_INVITE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `You can invite up to ${MAX_EMAILS_PER_INVITE} people at a time`,
        });
        return;
      }

      const invalid = emails.filter((e) => !isEmailValid(e));
      if (invalid.length > 0) {
        const quoted = invalid.map((e) => `"${e}"`).join(", ");
        const verb =
          invalid.length === 1
            ? "is not a valid email address"
            : "are not valid email addresses";
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${quoted} ${verb}`,
        });
      }
    }),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

interface ShareFrameSheetProps {
  fileId: string;
  owner: LightWorkspaceType;
  /** Busts share/grants cache when frame content changes (e.g. `fileId@updatedAt`). */
  contentHash?: string | null;
}

export function ShareFrameSheet({
  fileId,
  owner,
  contentHash,
}: ShareFrameSheetProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [shareBlockError, setShareBlockError] = useState<string[] | null>(null);
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const { AwaitableDialog, showDialog } = useAwaitableDialog();

  const { doShare, fileShare, isFileShareLoading } =
    useShareInteractiveContentFile({
      fileId,
      owner,
      cacheKey: contentHash,
    });

  const { grants, isGrantsLoading, doAddGrants, doRevokeGrant } =
    useSharingGrants({
      fileId,
      owner,
      cacheKey: contentHash,
      disabled: !isOpen,
    });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });

  const currentScope: FileShareScope =
    fileShare?.scope ?? "workspace_and_emails";
  const shareURL = fileShare?.shareUrl ?? "";
  const viewerFiles = fileShare?.viewerFiles ?? [];

  const allowedScopes = ALLOWED_SCOPES_BY_POLICY[owner.sharingPolicy];
  const availableScopeOptions = getScopeOptions(owner.sharingPolicy).filter(
    (o) => allowedScopes.includes(o.value)
  );

  const showEmailSection =
    currentScope === "emails_only" || currentScope === "workspace_and_emails";

  const activeGrants = grants
    .filter((g) => !g.blockedByPolicy)
    .sort((a, b) => a.email.localeCompare(b.email));

  const blockedGrants = grants
    .filter((g) => g.blockedByPolicy)
    .sort((a, b) => a.email.localeCompare(b.email));

  const onInviteSubmit = async (data: InviteFormValues) => {
    const emails = data.emailsRaw
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    await doAddGrants(emails);
    reset();
  };

  const handleRevoke = async (grant: SharingGrantType) => {
    const confirmed = await showDialog({
      title: "Revoke access",
      validateLabel: "Revoke",
      validateVariant: "warning",
      cancelLabel: "Cancel",
      children: (
        <p>
          Are you sure you want to revoke access for{" "}
          <strong>{grant.email}</strong>? They will no longer be able to view
          this frame.
        </p>
      ),
    });

    if (confirmed) {
      await doRevokeGrant(grant.id);
    }
  };

  return (
    <>
      <AwaitableDialog />
      <Button
        variant="ghost"
        label={isMobile ? undefined : "Share"}
        tooltip={isMobile ? "Share" : undefined}
        icon={Upload01}
        onClick={() => setIsOpen(true)}
      />
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setShareBlockError(null);
          }
        }}
      >
        <SheetContent size="lg">
          <SheetHeader>
            <div className="flex items-center justify-between pr-10">
              <SheetTitle>Share this frame</SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                icon={isCopied ? ClipboardCheck : Clipboard}
                label={isCopied ? "Copied!" : "Copy link"}
                onClick={async () => {
                  await copyToClipboard(shareURL);
                }}
              />
            </div>
          </SheetHeader>
          <SheetContainer>
            {isFileShareLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {owner.sharingPolicy === "workspace_only" && (
                  <ContentMessage
                    icon={InfoCircle}
                    variant="info"
                    title="Only workspace members can be added"
                  >
                    Your admin has disabled external sharing. You can only share
                    with people already in your workspace.
                  </ContentMessage>
                )}
                {shareBlockError && shareBlockError.length > 0 && (
                  <ContentMessage
                    icon={InfoCircle}
                    variant="warning"
                    title="Some referenced files cannot be shared"
                  >
                    Viewers will only be able to access files you can verify.
                    Fix or remove these references before sharing:{" "}
                    {shareBlockError.join(", ")}
                  </ContentMessage>
                )}
                <fieldset className="flex flex-col gap-2 border-none p-0">
                  <legend className="text-sm font-semibold text-foreground dark:text-foreground-night mb-2">
                    Who has access
                  </legend>
                  <div className="flex flex-col gap-1">
                    {availableScopeOptions.map((option) => {
                      const isSelected = option.value === currentScope;
                      const inputId = `share-scope-${option.value}`;
                      return (
                        <Label
                          key={option.value}
                          htmlFor={inputId}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                            isSelected
                              ? "border-highlight-300 bg-muted-background dark:border-highlight-300-night dark:bg-muted-background-night"
                              : "border-transparent hover:bg-muted-background/50 dark:hover:bg-muted-background-night/50"
                          }`}
                        >
                          <input
                            type="radio"
                            id={inputId}
                            name="share-scope"
                            value={option.value}
                            checked={isSelected}
                            onChange={async () => {
                              setShareBlockError(null);
                              const result = await doShare(option.value);
                              if (
                                !result.success &&
                                result.unverifiableRefs?.length
                              ) {
                                setShareBlockError(result.unverifiableRefs);
                              }
                            }}
                            className="sr-only"
                          />
                          <Icon
                            visual={option.icon}
                            size="sm"
                            className="shrink-0 text-muted-foreground dark:text-muted-foreground-night"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-primary dark:text-primary-night">
                              {option.label}
                            </span>
                            <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                              {option.description}
                            </span>
                          </div>
                        </Label>
                      );
                    })}
                  </div>
                </fieldset>

                {showEmailSection && (
                  <div className="flex flex-col gap-4">
                    <form
                      className="flex flex-col gap-2"
                      onSubmit={handleSubmit(onInviteSubmit)}
                    >
                      <Label htmlFor="email-invite">Invite by email</Label>
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <Input
                            id="email-invite"
                            placeholder="Add comma separated emails to invite"
                            {...register("emailsRaw")}
                            message={errors.emailsRaw?.message}
                            messageStatus={
                              errors.emailsRaw ? "error" : undefined
                            }
                          />
                        </div>
                        <Button
                          variant="primary"
                          label="Invite"
                          type="submit"
                          disabled={isSubmitting}
                        />
                      </div>
                    </form>

                    {isGrantsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Spinner size="sm" />
                      </div>
                    ) : grants.length === 0 ? (
                      <p className="py-2 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
                        No one has been invited yet.
                      </p>
                    ) : (
                      <ScrollArea className="max-h-96">
                        {activeGrants.map((grant) => (
                          <GrantRow
                            key={grant.id}
                            grant={grant}
                            onRevoke={() => handleRevoke(grant)}
                          />
                        ))}
                        {blockedGrants.length > 0 && (
                          <>
                            <p className="pb-2 pt-6 text-xs font-medium text-warning-500 dark:text-warning-500-night">
                              No longer have access since they are not in your
                              workspace
                            </p>
                            {blockedGrants.map((grant) => (
                              <GrantRow
                                key={grant.id}
                                grant={grant}
                                onRevoke={() => handleRevoke(grant)}
                                blocked
                              />
                            ))}
                          </>
                        )}
                      </ScrollArea>
                    )}
                  </div>
                )}
                <ViewerFilesSection viewerFiles={viewerFiles} />
              </div>
            )}
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
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

function ViewerFileLine({ viewerFile }: { viewerFile: ShareFrameViewerFile }) {
  const SourceIcon = VIEWER_FILE_SOURCE_ICONS[viewerFile.sourceKind];
  const FileIcon = getFileTypeIcon(viewerFile.contentType, viewerFile.name);

  return (
    <li className="flex min-w-0 items-center gap-1.5 py-0.5 text-xs text-foreground dark:text-foreground-night">
      <Icon
        visual={FileIcon}
        size="xs"
        className="shrink-0 text-muted-foreground dark:text-muted-foreground-night"
      />
      <div className="flex min-w-0 items-center gap-1 truncate">
        <span className="shrink-0 font-medium">{viewerFile.name}</span>
        <span className="shrink-0 text-muted-foreground dark:text-muted-foreground-night">
          from
        </span>
        <Icon
          visual={SourceIcon}
          size="xs"
          className="shrink-0 text-muted-foreground dark:text-muted-foreground-night"
        />
        <span className="truncate">{viewerFile.sourceName}</span>
        {viewerFile.pathInSource ? (
          <span className="truncate text-muted-foreground dark:text-muted-foreground-night">{`in /${viewerFile.pathInSource}`}</span>
        ) : null}
      </div>
    </li>
  );
}

function ViewerFilesSection({
  viewerFiles,
}: {
  viewerFiles: ShareFrameViewerFile[];
}) {
  if (viewerFiles.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-col gap-2 border-none p-0">
      <legend className="text-sm font-semibold text-foreground dark:text-foreground-night">
        Files used
      </legend>
      <p className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
        When shared, viewers can only access these files—not the rest of the
        conversation or pod.
      </p>
      <ul className="flex flex-col gap-0">
        {viewerFiles.map((viewerFile, index) => (
          <ViewerFileLine
            key={`${viewerFile.sourceKind}:${viewerFile.sourceName}:${viewerFile.name}:${index}`}
            viewerFile={viewerFile}
          />
        ))}
      </ul>
    </fieldset>
  );
}

interface GrantRowProps {
  grant: SharingGrantType;
  onRevoke: () => void;
  blocked?: boolean;
}

function GrantRow({ grant, onRevoke, blocked = false }: GrantRowProps) {
  const now = new Date();
  const invitedBy = grant.grantedBy?.fullName ?? grant.grantedBy?.email;
  const grantedAgo = intlFormatDistance(new Date(grant.grantedAt), now);
  const invitedLabel = invitedBy
    ? `Invited by ${invitedBy} ${grantedAgo}`
    : `Invited ${grantedAgo}`;

  const viewedLabel = grant.lastViewedAt
    ? `Viewed ${intlFormatDistance(new Date(grant.lastViewedAt), now)}`
    : "Never viewed";

  // TODO(sparkle): ContextItem forces items-start when children are present.
  // Add an itemsAlignment prop to ContextItem to allow centering.
  return (
    <ContextItem
      title={grant.email}
      visual={
        <Avatar
          size="xs"
          name={grant.email}
          isRounded
          className={blocked ? "opacity-40" : undefined}
        />
      }
      hasSeparator={false}
      action={
        <IconButton
          icon={XClose}
          tooltip="Revoke access"
          size="xs"
          onClick={onRevoke}
        />
      }
      hoverAction
      className={blocked ? "opacity-60" : undefined}
    >
      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        {invitedLabel} · {viewedLabel}
      </span>
    </ContextItem>
  );
}
