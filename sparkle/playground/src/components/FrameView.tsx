import "@dust-tt/sparkle/styles/allotment.css";

import {
  ArrowCircleIcon,
  ArrowUpOnSquareIcon,
  Button,
  ClipboardCheckIcon,
  ClipboardIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  FullscreenIcon,
  ImageIcon,
  Input,
  LinkIcon,
  ListGroup,
  ListItem,
  MoreIcon,
  MovingMailIcon,
  PdfLogo,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SpaceOpenIcon,
  TextArea,
  XMarkIcon,
  useCopyToClipboard,
  useSendNotification,
  ArrowGoBackIcon,
} from "@dust-tt/sparkle";
import { Allotment } from "allotment";
import { useMemo, useState } from "react";

import { mockSpaces } from "../data";

type LinkSharingLevel = "none" | "collaborators" | "anyone";

export function FrameView() {
  const randomProjectName = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * mockSpaces.length);
    return mockSpaces[randomIndex]?.name ?? "Project";
  }, []);
  const [isAddedToProject, setIsAddedToProject] = useState(false);
  const [isCodeViewOpen, setIsCodeViewOpen] = useState(false);
  const [linkSharingLevel, setLinkSharingLevel] =
    useState<LinkSharingLevel>("none");
  const [isShareByLinkModalOpen, setIsShareByLinkModalOpen] = useState(false);
  const [publicLinkUrl, setPublicLinkUrl] = useState<string>("");
  const [sharedEmails, setSharedEmails] = useState<
    Array<{ email: string; invitedBy: string; invitedAt: Date }>
  >([]);
  const [isShareByEmailDialogOpen, setIsShareByEmailDialogOpen] =
    useState(false);
  const [isSharedEmailsSheetOpen, setIsSharedEmailsSheetOpen] = useState(false);
  const [emailInputValue, setEmailInputValue] = useState("");
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const [emailToRevoke, setEmailToRevoke] = useState<string | null>(null);
  const [isCopied, copyToClipboard] = useCopyToClipboard();
  const sendNotification = useSendNotification();
  const frameCode = useMemo(
    () => `export default function FrameTemplate() {
  return (
    <main className="frame-root">
      <h1>Frame preview</h1>
      <p>Prototype content rendered in conversation panel.</p>
    </main>
  );
}`,
    []
  );
  const frameCodeRows = useMemo(
    () => Math.max(frameCode.split("\n").length, 1),
    [frameCode]
  );

  const handleAddToProject = () => {
    if (isAddedToProject) {
      return;
    }

    setIsAddedToProject(true);
    sendNotification({
      type: "success",
      title: `Frame added to project ${randomProjectName}`,
    });
  };

  const handleCopyCode = async () => {
    await copyToClipboard(frameCode);
  };

  const handleOpenShareModal = () => {
    setIsShareByLinkModalOpen(true);
  };

  const hasPublicLink = linkSharingLevel !== "none";

  const handleLinkSharingLevelChange = (level: LinkSharingLevel) => {
    setLinkSharingLevel(level);
    if (level === "none") {
      setPublicLinkUrl("");
    } else {
      setPublicLinkUrl("https://dust.tt/frame/preview-abc123");
    }
  };

  const handleCopyLink = async () => {
    if (!publicLinkUrl) return;
    await copyToClipboard(publicLinkUrl);
    setIsShareByLinkModalOpen(false);
    sendNotification({ type: "success", title: "Copied to clipboard" });
  };

  const handleShareByEmail = () => {
    const emails = emailInputValue
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length > 0) {
      const now = new Date();
      const newEntries = emails.map((email) => ({
        email,
        invitedBy: "You",
        invitedAt: now,
      }));
      setSharedEmails((prev) => {
        const existing = new Set(prev.map((e) => e.email));
        const toAdd = newEntries.filter((e) => !existing.has(e.email));
        return [...prev, ...toAdd];
      });
      setEmailInputValue("");
      setIsShareByEmailDialogOpen(false);
      sendNotification({
        type: "success",
        title: `Shared with ${emails.length} recipient${emails.length > 1 ? "s" : ""}`,
      });
    }
  };

  const handleOpenRevokeDialog = (email: string) => {
    setEmailToRevoke(email);
    setIsRevokeDialogOpen(true);
  };

  const handleRevokeAccess = () => {
    if (emailToRevoke) {
      setSharedEmails((prev) => prev.filter((e) => e.email !== emailToRevoke));
      setEmailToRevoke(null);
      setIsRevokeDialogOpen(false);
      sendNotification({
        type: "success",
        title: "Access revoked",
      });
    }
  };

  const formatSharedEmailDate = (date: Date) => {
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <div className="s-h-screen s-w-full s-bg-background">
      <Allotment
        vertical={false}
        proportionalLayout={true}
        defaultSizes={[50, 50]}
        className="s-h-full s-w-full s-flex-1"
      >
        <Allotment.Pane
          minSize={320}
          preferredSize={50}
          className="s-h-full s-border-r s-border-border"
        >
          <div className="s-h-full s-w-full" />
        </Allotment.Pane>

        <Allotment.Pane minSize={320} preferredSize={50} className="s-h-full">
          <div className="s-flex s-h-full s-flex-col">
            <div className="s-flex s-h-14 s-w-full s-items-center s-gap-2 s-border-b s-border-border s-bg-background s-px-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    icon={ArrowUpOnSquareIcon}
                    variant="outline"
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger label="Download" />
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger icon={PdfLogo} label="PDF" />
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem label="Portrait" />
                              <DropdownMenuItem label="Landscape" />
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                        <DropdownMenuItem label="PNG" icon={ImageIcon} />
                        <DropdownMenuItem
                          label="Template"
                          icon={CommandLineIcon}
                        />
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger label="Share with…" />
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        {hasPublicLink ? (
                          <>
                            <DropdownMenuItem
                              label="Copy link"
                              icon={ClipboardIcon}
                              onClick={handleCopyLink}
                              description={
                                linkSharingLevel === "collaborators"
                                  ? "Workspace members"
                                  : "Anyone with the link"
                              }
                            />
                            <DropdownMenuItem
                              label="Manage link"
                              icon={Cog6ToothIcon}
                              onClick={handleOpenShareModal}
                            />
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem
                              label="Share a link"
                              icon={LinkIcon}
                              onClick={handleOpenShareModal}
                            />
                          </>
                        )}
                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          label="Share by email"
                          icon={MovingMailIcon}
                          onClick={() => setIsShareByEmailDialogOpen(true)}
                        />
                        {sharedEmails.length > 0 && (
                          <DropdownMenuItem
                            label={`Manage emails (${sharedEmails.length})`}
                            icon={Cog6ToothIcon}
                            onClick={() => setIsSharedEmailsSheetOpen(true)}
                          />
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                icon={ArrowCircleIcon}
                variant="ghost"
                tooltip="Refresh"
              />
              <Button
                icon={FullscreenIcon}
                variant="ghost"
                tooltip="Full screen"
              />
              <div className="s-flex s-h-8 s-items-center s-gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button icon={MoreIcon} variant="ghost" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem label="Revert" icon={ArrowGoBackIcon} />
                    <DropdownMenuItem
                      label="Code view"
                      icon={CommandLineIcon}
                      onClick={() => setIsCodeViewOpen(true)}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel
                      label={
                        isAddedToProject
                          ? `Saved to project ${randomProjectName}`
                          : `Project: ${randomProjectName}`
                      }
                    />
                    {!isAddedToProject && (
                      <DropdownMenuItem
                        label="Add to project"
                        icon={SpaceOpenIcon}
                        onClick={handleAddToProject}
                      />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="s-flex-1" />
              <Button icon={XMarkIcon} variant="ghost" />
            </div>
          </div>
        </Allotment.Pane>
      </Allotment>
      <Sheet
        open={isSharedEmailsSheetOpen}
        onOpenChange={setIsSharedEmailsSheetOpen}
      >
        <SheetContent size="md" side="right">
          <SheetHeader>
            <SheetTitle>
              Manage email access
              <div className="s-flex s-w-full s-pt-2 s-justify-start">
                <Button
                  label="Share by email"
                  variant="outline"
                  icon={MovingMailIcon}
                  onClick={() => setIsShareByEmailDialogOpen(true)}
                />
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer isListSelector>
            {sharedEmails.length === 0 ? (
              <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night s-p-8 s-text-center">
                The frame isn't beeing shared by email currently.
              </p>
            ) : (
              <ListGroup>
                {sharedEmails.map((item) => (
                  <ListItem
                    key={item.email}
                    itemsAlignment="center"
                    hasSeparator
                  >
                    <div className="s-flex s-min-w-0 s-flex-1 s-flex-col s-px-2">
                      <span className="s-heading-sm s-text-foreground">
                        {item.email}
                      </span>
                      <span className="s-text-xs s-text-muted-foreground">
                        Invited by {item.invitedBy} on{" "}
                        {formatSharedEmailDate(item.invitedAt)}
                      </span>
                    </div>
                    <Button
                      icon={XMarkIcon}
                      variant="ghost-secondary"
                      size="sm"
                      onClick={() => handleOpenRevokeDialog(item.email)}
                    />
                  </ListItem>
                ))}
              </ListGroup>
            )}
          </SheetContainer>
        </SheetContent>
      </Sheet>
      <Sheet open={isCodeViewOpen} onOpenChange={setIsCodeViewOpen}>
        <SheetContent size="lg" side="right">
          <SheetHeader>
            <SheetTitle>Frame: Code view</SheetTitle>
          </SheetHeader>
          <div className="s-flex s-h-full s-flex-col s-gap-3 s-px-4">
            <div className="s-flex s-justify-end">
              <Button
                size="sm"
                variant="outline"
                icon={isCopied ? ClipboardCheckIcon : ClipboardIcon}
                label={isCopied ? "Copied" : "Copy to clipboard"}
                onClick={handleCopyCode}
              />
            </div>
            <TextArea value={frameCode} rows={frameCodeRows} readOnly />
          </div>
        </SheetContent>
      </Sheet>
      <Dialog
        open={isShareByLinkModalOpen}
        onOpenChange={(open) => !open && setIsShareByLinkModalOpen(false)}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Share by link</DialogTitle>
          </DialogHeader>
          <DialogContainer className="s-space-y-0">
            <div className="s-flex s-items-baseline s-gap-2 s-heading-sm s-text-foreground dark:s-text-foreground-night">
              Activate link sharing for
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    isSelect
                    label={
                      linkSharingLevel === "none"
                        ? "No one (Disabled)"
                        : linkSharingLevel === "collaborators"
                          ? "Collaborators"
                          : "Anyone"
                    }
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    label="No one (Disabled)"
                    onClick={() => handleLinkSharingLevelChange("none")}
                  />
                  <DropdownMenuItem
                    label="Collaborators"
                    onClick={() =>
                      handleLinkSharingLevelChange("collaborators")
                    }
                  />
                  <DropdownMenuItem
                    label="Anyone"
                    onClick={() => handleLinkSharingLevelChange("anyone")}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {linkSharingLevel === "none" && "Link sharing is disabled."}
              {linkSharingLevel === "collaborators" &&
                "Members of the workspace can access the frame with the link."}
              {linkSharingLevel === "anyone" &&
                "The link will be accessible by anyone who has it."}
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setIsShareByLinkModalOpen(false),
            }}
            rightButtonProps={{
              label: "Save & copy link",
              variant: "highlight",
              onClick: handleCopyLink,
              disabled: !hasPublicLink,
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={isShareByEmailDialogOpen}
        onOpenChange={(open) =>
          !open && (setIsShareByEmailDialogOpen(false), setEmailInputValue(""))
        }
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Share by email</DialogTitle>
          </DialogHeader>
          <DialogContainer className="s-space-y-6">
            <Input
              label="Email addresses"
              placeholder="email1@example.com, email2@example.com"
              value={emailInputValue}
              onChange={(e) => setEmailInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleShareByEmail();
              }}
            />
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setIsShareByEmailDialogOpen(false);
                setEmailInputValue("");
              },
            }}
            rightButtonProps={{
              label: "Share",
              variant: "primary",
              onClick: handleShareByEmail,
              disabled: !emailInputValue
                .split(",")
                .map((e) => e.trim())
                .filter(Boolean).length,
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={isRevokeDialogOpen}
        onOpenChange={(open) =>
          !open && (setIsRevokeDialogOpen(false), setEmailToRevoke(null))
        }
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Revoke access</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              You are about to revoke access of {emailToRevoke} to this frame.
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setIsRevokeDialogOpen(false);
                setEmailToRevoke(null);
              },
            }}
            rightButtonProps={{
              label: "Revoke",
              variant: "warning",
              onClick: handleRevokeAccess,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
