import { useAwaitableDialog } from "@app/hooks/useAwaitableDialog";
import {
  useShareInteractiveContentFile,
  useSharingGrants,
} from "@app/lib/swr/files";
import { isEmailValid } from "@app/lib/utils";
import { intlFormatDistance } from "date-fns";
import {
  MAX_EMAILS_PER_INVITE,
  type FileShareScope,
  type SharingGrantType,
} from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ArrowUpOnSquareIcon,
  Avatar,
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  ContextItem,
  GlobeAltIcon,
  Icon,
  IconButton,
  Input,
  Label,
  LockIcon,
  ScrollArea,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  UserGroupIcon,
  useCopyToClipboard,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useState } from "react";

const SCOPE_OPTIONS: {
  icon: typeof LockIcon;
  label: string;
  description: string;
  value: FileShareScope;
}[] = [
  {
    icon: LockIcon,
    label: "Email invites only",
    description: "Only people you invite by email can view this",
    value: "emails_only",
  },
  {
    icon: UserGroupIcon,
    label: "Workspace members and email invites",
    description: "Everyone in your workspace, plus anyone you invite by email",
    value: "workspace_and_emails",
  },
  {
    icon: GlobeAltIcon,
    label: "Anyone with the link",
    description: "No sign-in required",
    value: "public",
  },
];

interface ShareFrameSheetProps {
  fileId: string;
  owner: LightWorkspaceType;
}

export function ShareFrameSheet({ fileId, owner }: ShareFrameSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const { AwaitableDialog, showDialog } = useAwaitableDialog();

  const { doShare, fileShare, isFileShareLoading } =
    useShareInteractiveContentFile({ fileId, owner });

  const { grants, isGrantsLoading, doAddGrants, doRevokeGrant } =
    useSharingGrants({ fileId, owner, disabled: !isOpen });

  const currentScope = fileShare?.scope ?? "workspace";
  const shareURL = fileShare?.shareUrl ?? "";

  const showEmailSection =
    currentScope === "emails_only" || currentScope === "workspace_and_emails";

  const parseEmails = () =>
    emailInput
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

  const validateAndInvite = async () => {
    const emails = parseEmails();
    if (emails.length === 0) {
      return;
    }

    if (emails.length > MAX_EMAILS_PER_INVITE) {
      setEmailError(
        `You can invite up to ${MAX_EMAILS_PER_INVITE} people at a time`
      );
      return;
    }

    const invalid = emails.filter((e) => !isEmailValid(e));
    if (invalid.length > 0) {
      const quoted = invalid.map((e) => `"${e}"`).join(", ");
      const verb =
        invalid.length === 1
          ? "is not a valid email address"
          : "are not valid email addresses";
      setEmailError(`${quoted} ${verb}`);
      return;
    }

    setEmailError(null);
    setIsInviting(true);
    try {
      await doAddGrants(emails);
      setEmailInput("");
    } finally {
      setIsInviting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void validateAndInvite();
    }
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
          this content.
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
        label="Share"
        icon={ArrowUpOnSquareIcon}
        onClick={() => setIsOpen(true)}
      />
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent size="lg">
          <SheetHeader>
            <div className="flex items-center justify-between pr-10">
              <SheetTitle>Share this content</SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="share-scope">Who has access</Label>
                  <div className="flex flex-col gap-1">
                    {SCOPE_OPTIONS.map((option) => {
                      const isSelected = option.value === currentScope;
                      return (
                        <button
                          key={option.value}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                            isSelected
                              ? "bg-muted-background dark:bg-muted-background-night"
                              : "hover:bg-muted-background/50 dark:hover:bg-muted-background-night/50"
                          }`}
                          onClick={() => doShare(option.value)}
                        >
                          <Icon
                            visual={option.icon}
                            size="sm"
                            className="shrink-0 text-muted-foreground dark:text-muted-foreground-night"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-primary dark:text-primary-night">
                              {option.label}
                            </span>
                            <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                              {option.description}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {showEmailSection && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="email-invite">Invite by email</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Input
                            id="email-invite"
                            placeholder="Add comma separated emails to invite"
                            value={emailInput}
                            onChange={(e) => {
                              setEmailInput(e.target.value);
                              setEmailError(null);
                            }}
                            onKeyDown={handleKeyDown}
                            message={emailError ?? undefined}
                            messageStatus={emailError ? "error" : undefined}
                          />
                        </div>
                        <Button
                          variant="primary"
                          label="Invite"
                          onClick={validateAndInvite}
                          disabled={
                            isInviting || emailInput.trim().length === 0
                          }
                        />
                      </div>
                    </div>

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
                        {grants.map((grant) => (
                          <GrantRow
                            key={grant.id}
                            grant={grant}
                            onRevoke={() => handleRevoke(grant)}
                          />
                        ))}
                      </ScrollArea>
                    )}
                  </div>
                )}
              </div>
            )}
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}

interface GrantRowProps {
  grant: SharingGrantType;
  onRevoke: () => void;
}

function GrantRow({ grant, onRevoke }: GrantRowProps) {
  const now = new Date();
  const invitedBy = grant.grantedBy?.fullName ?? grant.grantedBy?.email;
  const grantedAgo = intlFormatDistance(new Date(grant.grantedAt), now);
  const invitedLabel = invitedBy
    ? `Invited by ${invitedBy} ${grantedAgo}`
    : `Invited ${grantedAgo}`;

  const viewedLabel = grant.lastViewedAt
    ? `Viewed ${intlFormatDistance(new Date(grant.lastViewedAt), now)}`
    : "Never viewed";

  return (
    <ContextItem
      title={grant.email}
      visual={<Avatar size="xs" name={grant.email} isRounded />}
      hasSeparator={false}
      action={
        <IconButton
          icon={XMarkIcon}
          tooltip="Revoke access"
          size="xs"
          onClick={onRevoke}
        />
      }
      hoverAction
    >
      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        {invitedLabel} · {viewedLabel}
      </span>
    </ContextItem>
  );
}
