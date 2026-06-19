import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import type { NotificationPreferencesRefProps } from "@app/components/me/NotificationPreferences";
import { NotificationPreferences } from "@app/components/me/NotificationPreferences";
import { PendingInvitationsTable } from "@app/components/me/PendingInvitationsTable";
import { UserToolsTable } from "@app/components/me/UserToolsTable";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { AwuUsageBar } from "@app/components/workspace/MembersUsageTable";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useIsMac } from "@app/hooks/useKeyboardShortcutLabel";
import { useAuth } from "@app/lib/auth/AuthContext";
import { isSubmitMessageKey } from "@app/lib/keymaps";
import { useMyUsage, useSeatPlan } from "@app/lib/swr/credits";
import {
  usePatchUser,
  usePendingInvitations,
  useUser,
  useWorkspaceUsageStatus,
} from "@app/lib/swr/user";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import type { WorkspaceType } from "@app/types/user";
import { ANONYMOUS_USER_IMAGE_URL } from "@app/types/user";
import {
  Avatar,
  BarChart01,
  Bell01,
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Edit04,
  Input,
  Label,
  Mail01,
  Moon01,
  NavigationList,
  NavigationListItem,
  Separator,
  Settings01,
  ShapesPlus,
  Spinner,
  Stars02,
  Sun,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  User01,
  XClose,
  Zap,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLinkIcon } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useController, useForm } from "react-hook-form";
import { z } from "zod";

type SettingsSection =
  | "personal"
  | "usage"
  | "customization"
  | "notifications"
  | "tools"
  | "invitations";

interface UserSettingsPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: WorkspaceType;
}

// ─── Shared section wrapper ───────────────────────────────────────────────────

interface SectionContentProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function SectionContent({
  title,
  description,
  children,
  footer,
}: SectionContentProps) {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-8">
        <header className="flex flex-col gap-1">
          <h2 className="min-h-9 text-2xl font-semibold leading-9 text-foreground dark:text-foreground-night">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {description}
            </p>
          )}
        </header>
        {children}
      </div>
      {footer && (
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4 dark:border-border-night">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Usage ────────────────────────────────────────────────────────────────────

function ordinalDay(day: number): string {
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix}`;
}

interface UsageSectionProps {
  owner: WorkspaceType;
  onClose: () => void;
}

function UsageSection({ owner, onClose }: UsageSectionProps) {
  const { isAdmin, subscription } = useAuth();
  const { myUsage, nextCreditResetAt, isMyUsageLoading } = useMyUsage({
    workspaceId: owner.sId,
  });
  const { seatPlans } = useSeatPlan({ workspaceId: owner.sId });

  const { hasPendingUpgradeRequest } = useWorkspaceUsageStatus({
    owner,
    disabled: isAdmin,
  });

  const seatName =
    (myUsage?.seatType ? seatPlans[myUsage.seatType]?.name : null) ??
    subscription.plan.name;

  const isLoading = isMyUsageLoading;

  const hasPersonalUsage =
    (myUsage?.spendLimitAwuCredits ?? myUsage?.memberUsageLimit ?? null) !==
    null;

  return (
    <SectionContent
      title="Usage"
      description="Manage the usage of your Dust workspace"
    >
      <section className="flex flex-col gap-2 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-highlight-100 outline outline-1 outline-highlight-500/20 dark:bg-highlight-100-night">
              <Stars02 className="h-3 w-3 text-highlight-500" />
            </span>
            <span className="text-base font-semibold text-foreground dark:text-foreground-night">
              {seatName}
            </span>
          </span>
          <UsageUpgradeButton
            owner={owner}
            hasPendingUpgradeRequest={hasPendingUpgradeRequest}
            variant="button"
            isAdmin={isAdmin}
            onAdminNavigate={onClose}
          />
        </div>
        <Separator />
        {isLoading ? (
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {hasPersonalUsage ? (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground dark:text-foreground-night">
                    Your Credits
                  </span>
                  {nextCreditResetAt &&
                    (() => {
                      const d = new Date(nextCreditResetAt);
                      const month = d.toLocaleDateString("en-US", {
                        month: "long",
                        timeZone: "UTC",
                      });
                      return (
                        <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                          Resets on {month} {ordinalDay(d.getUTCDate())}
                        </span>
                      );
                    })()}
                </div>
                <AwuUsageBar
                  consumed={myUsage?.consumedAwuCredits ?? 0}
                  consumedFromAllowance={
                    myUsage?.consumedFromAllowanceAwuCredits ?? 0
                  }
                  consumedFromPool={myUsage?.consumedFromPoolAwuCredits ?? 0}
                  memberUsageLimit={myUsage?.memberUsageLimit ?? null}
                  effectiveLimit={myUsage?.spendLimitAwuCredits ?? 0}
                  seatType={myUsage?.seatType ?? null}
                  isTotalAllowedUsagePending={false}
                />
              </>
            ) : null}
          </div>
        )}
      </section>

      {isAdmin && (
        <section className="flex items-center justify-between border-b border-border pb-4 dark:border-border-night">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Invoices
            </span>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Access and download your invoices
            </span>
          </div>
          <Button
            variant="outline"
            size="xs"
            label="Billing"
            icon={ExternalLinkIcon}
            href={`/w/${owner.sId}/billing`}
            target="_blank"
          />
        </section>
      )}
    </SectionContent>
  );
}

// ─── Personal Information ─────────────────────────────────────────────────────

const PersonalInfoSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  profilePictureUrl: z.string().nullable(),
});

type PersonalInfoType = z.infer<typeof PersonalInfoSchema>;

function PersonalInfoSection({ owner }: { owner: WorkspaceType }) {
  const { user, isUserLoading } = useUser();
  const { patchUser } = usePatchUser();
  const isProvisioned = user?.origin === "provisioned";
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fileUploaderService = useFileUploaderService({
    hasSandboxTools: false,
    owner,
    useCase: "avatar",
  });

  const form = useForm<PersonalInfoType>({
    resolver: zodResolver(PersonalInfoSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      profilePictureUrl: user?.image ?? null,
    },
  });

  const { field: profilePictureField } = useController({
    name: "profilePictureUrl",
    control: form.control,
  });
  const currentImageUrl = profilePictureField.value ?? ANONYMOUS_USER_IMAGE_URL;

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName ?? "",
        profilePictureUrl: user.image ?? null,
      });
    }
  }, [user, form]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setIsUploadingImage(true);
    const files = await fileUploaderService.handleFilesUpload([file]);
    setIsUploadingImage(false);
    if (files && files.length > 0 && files[0].publicUrl) {
      profilePictureField.onChange(files[0].publicUrl);
    }
  };

  const handleSave = async (data: PersonalInfoType) => {
    await patchUser(
      data.firstName,
      data.lastName,
      true,
      undefined,
      data.profilePictureUrl
    );
  };

  if (isUserLoading) {
    return (
      <SectionContent title="Personal Informations">
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      </SectionContent>
    );
  }

  return (
    <SectionContent
      title="Personal Informations"
      footer={
        <Button
          label="Save"
          variant="primary"
          type="button"
          onClick={form.handleSubmit(handleSave)}
          disabled={!form.formState.isDirty || form.formState.isSubmitting}
          isLoading={form.formState.isSubmitting}
        />
      }
    >
      <FormProvider form={form} onSubmit={handleSave}>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleImageUpload}
        />

        <div className="group relative w-fit">
          <Avatar size="lg" visual={currentImageUrl} isRounded />
          <Button
            variant="outline"
            size="sm"
            icon={Edit04}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
            disabled={isUploadingImage || isProvisioned}
            isLoading={isUploadingImage}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                label="First Name"
                {...form.register("firstName")}
                placeholder="First Name"
                disabled={isProvisioned}
                isError={!!form.formState.errors.firstName}
                message={form.formState.errors.firstName?.message}
                messageStatus={
                  form.formState.errors.firstName ? "error" : undefined
                }
              />
            </div>
            <div className="flex-1">
              <Input
                label="Last Name"
                {...form.register("lastName")}
                placeholder="Last Name"
                disabled={isProvisioned}
                isError={!!form.formState.errors.lastName}
                message={form.formState.errors.lastName?.message}
                messageStatus={
                  form.formState.errors.lastName ? "error" : undefined
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Label>Email</Label>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {user?.email}
            </span>
          </div>
        </div>
      </FormProvider>
    </SectionContent>
  );
}

// ─── Customization ────────────────────────────────────────────────────────────

function CustomizationSection() {
  const { theme: currentTheme, setTheme } = useTheme();
  const isMac = useIsMac();

  const modEnterLabel = useMemo(
    () => (isMac ? "Cmd + Enter (⌘ + ↵)" : "Ctrl + Enter"),
    [isMac]
  );
  const modEnterMenuLabel = useMemo(
    () => (isMac ? "Cmd + Enter" : "Ctrl + Enter"),
    [isMac]
  );
  const modEnterShortcut = useMemo(
    () => (isMac ? "⌘ + ↵" : "Ctrl + ↵"),
    [isMac]
  );

  const [localTheme, setLocalTheme] = useState(currentTheme ?? "system");
  const [submitKey, setSubmitKey] = useState<"enter" | "cmd+enter">(() => {
    if (typeof window === "undefined") {
      return "enter";
    }
    const stored = localStorage.getItem("submitMessageKey");
    return stored && isSubmitMessageKey(stored) ? stored : "enter";
  });
  const isDirty =
    localTheme !== currentTheme ||
    submitKey !==
      (typeof window !== "undefined"
        ? (localStorage.getItem("submitMessageKey") ?? "enter")
        : "enter");

  const handleSave = () => {
    setTheme(localTheme as "light" | "dark" | "system");
    if (typeof window !== "undefined") {
      localStorage.setItem("submitMessageKey", submitKey);
    }
  };

  return (
    <SectionContent
      title="Customization"
      footer={
        <Button
          label="Save"
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
        />
      }
    >
      <div className="flex w-full gap-4">
        <div className="flex-1">
          <div className="mb-2">
            <Label>Theme</Label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                icon={
                  localTheme === "light"
                    ? Sun
                    : localTheme === "dark"
                      ? Moon01
                      : Sun
                }
                label={
                  localTheme === "light"
                    ? "Light"
                    : localTheme === "dark"
                      ? "Dark"
                      : "System"
                }
                isSelect
                className="w-fit"
              />
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent>
                <DropdownMenuItem
                  icon={Sun}
                  label="Light"
                  onClick={() => setLocalTheme("light")}
                />
                <DropdownMenuItem
                  icon={Moon01}
                  label="Dark"
                  onClick={() => setLocalTheme("dark")}
                />
                <DropdownMenuItem
                  icon={Sun}
                  label="System"
                  onClick={() => setLocalTheme("system")}
                />
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>

        <div className="flex-1">
          <div className="mb-2">
            <Label>Keyboard Shortcuts</Label>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="copy-sm flex items-center gap-2 text-foreground dark:text-foreground-night">
                Send message:
                <Button
                  variant="outline"
                  label={submitKey === "enter" ? "Enter (↵)" : modEnterLabel}
                  isSelect
                  className="w-fit"
                />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setSubmitKey("enter")}>
                  Enter
                  <DropdownMenuShortcut>↵</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSubmitKey("cmd+enter")}>
                  {modEnterMenuLabel}
                  <DropdownMenuShortcut>
                    {modEnterShortcut}
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        </div>
      </div>
    </SectionContent>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection({ owner }: { owner: WorkspaceType }) {
  const { user } = useUser();
  const notificationPreferencesRef =
    useRef<NotificationPreferencesRefProps>(null);
  const [isDirty, setIsDirty] = useState(false);

  const handleSave = async () => {
    if (notificationPreferencesRef.current) {
      await notificationPreferencesRef.current.savePreferences();
      setIsDirty(false);
    }
  };

  if (!user?.subscriberHash) {
    return (
      <SectionContent title="Notifications">
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Notification preferences are not available for your account.
        </p>
      </SectionContent>
    );
  }

  return (
    <SectionContent
      title="Notifications"
      footer={
        <Button
          label="Save"
          variant="primary"
          type="button"
          onClick={handleSave}
          disabled={!isDirty}
        />
      }
    >
      <NotificationPreferences
        ref={notificationPreferencesRef}
        onChanged={() => setIsDirty(true)}
        owner={owner}
      />
    </SectionContent>
  );
}

// ─── Tools & Triggers ─────────────────────────────────────────────────────────

function ToolsSection({ owner }: { owner: WorkspaceType }) {
  return (
    <SectionContent title="Tools and Triggers">
      <Tabs defaultValue="tools">
        <TabsList border>
          <TabsTrigger value="tools" label="Tools" icon={Zap} />
          <TabsTrigger value="triggers" label="Triggers" icon={Bell01} />
        </TabsList>
        <TabsContent value="tools">
          <UserToolsTable owner={owner} />
        </TabsContent>
        <TabsContent value="triggers">
          <p className="py-8 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
            Coming soon
          </p>
        </TabsContent>
      </Tabs>
    </SectionContent>
  );
}

// ─── Invitations ──────────────────────────────────────────────────────────────

interface InvitationsSectionProps {
  invitations: PendingInvitationOption[];
  isLoading: boolean;
}

function InvitationsSection({
  invitations,
  isLoading,
}: InvitationsSectionProps) {
  return (
    <SectionContent
      title="Invitations"
      description="Workspaces you've been invited to join"
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <PendingInvitationsTable invitations={invitations} />
      )}
    </SectionContent>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{
  section: SettingsSection;
  icon: React.ComponentType;
  label: string;
}> = [
  { section: "personal", icon: User01, label: "Personal Information" },
  { section: "usage", icon: BarChart01, label: "Usage" },
  { section: "customization", icon: Settings01, label: "Customization" },
  { section: "notifications", icon: Bell01, label: "Notifications" },
  { section: "tools", icon: ShapesPlus, label: "Tools and Triggers" },
];

export function UserSettingsPopover({
  open,
  onOpenChange,
  owner,
}: UserSettingsPopoverProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("personal");

  // Only fetch while the popover is open: it is always mounted in the user menu.
  const { pendingInvitations, isPendingInvitationsLoading } =
    usePendingInvitations({ workspaceId: owner.sId, disabled: !open });
  const hasPendingInvitations = pendingInvitations.length > 0;

  // The "Invitations" item only appears when the user has pending invitations.
  const navItems = useMemo<typeof NAV_ITEMS>(
    () =>
      hasPendingInvitations
        ? [
            ...NAV_ITEMS,
            { section: "invitations", icon: Mail01, label: "Invitations" },
          ]
        : NAV_ITEMS,
    [hasPendingInvitations]
  );

  useEffect(() => {
    if (open) {
      setActiveSection("personal");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="2xl"
        height="xl"
        className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:duration-200 data-[state=closed]:duration-150 data-[state=open]:ease-out data-[state=closed]:ease-in motion-reduce:animate-none"
      >
        <div className="flex h-full flex-col overflow-hidden sm:flex-row">
          {/* Mobile: horizontal tab strip */}
          <nav className="flex flex-shrink-0 items-center border-b border-border bg-muted-background sm:hidden dark:border-border-night dark:bg-muted-background-night">
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="xmini"
                icon={XClose}
                className="flex-shrink-0 px-2"
              />
            </DialogClose>
            <div className="flex flex-1">
              {navItems.map(({ section, icon: Icon, label }) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveSection(section)}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2 transition-colors",
                    activeSection === section
                      ? "bg-highlight-100 text-highlight-600 dark:bg-highlight-100-night dark:text-highlight-500"
                      : "text-muted-foreground hover:bg-muted-background dark:text-muted-foreground-night dark:hover:bg-muted-background-night"
                  )}
                >
                  <span className="flex size-4 items-center justify-center">
                    <Icon />
                  </span>
                  <span className="line-clamp-1 text-xs">{label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Desktop: vertical sidebar */}
          <div className="hidden w-64 flex-shrink-0 flex-col border-r border-border bg-muted-background sm:flex dark:border-border-night dark:bg-muted-background-night">
            <div className="flex-shrink-0 p-2">
              <DialogClose asChild>
                <Button variant="ghost" size="mini" icon={XClose} />
              </DialogClose>
            </div>
            <NavigationList className="flex-1 px-2 pb-3">
              {navItems.map(({ section, icon, label }) => (
                <NavigationListItem
                  key={section}
                  icon={icon}
                  label={label}
                  selected={activeSection === section}
                  onClick={() => setActiveSection(section)}
                />
              ))}
            </NavigationList>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            {activeSection === "personal" && (
              <PersonalInfoSection owner={owner} />
            )}
            {activeSection === "usage" && (
              <UsageSection owner={owner} onClose={() => onOpenChange(false)} />
            )}
            {activeSection === "customization" && <CustomizationSection />}
            {activeSection === "notifications" && (
              <NotificationsSection owner={owner} />
            )}
            {activeSection === "tools" && <ToolsSection owner={owner} />}
            {activeSection === "invitations" && (
              <InvitationsSection
                invitations={pendingInvitations}
                isLoading={isPendingInvitationsLoading}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
