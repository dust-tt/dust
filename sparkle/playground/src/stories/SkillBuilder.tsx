import {
  Avatar,
  BarFooter,
  BarHeader,
  Button,
  ChevronDown,
  ClockRewind,
  cn,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  File02,
  Icon,
  InfoCircle,
  Input,
  Plus,
  PuzzlePiece01,
  ScrollArea,
  SliderToggle,
  Stars02,
  Tooltip,
  Users01,
  XClose,
} from "@dust-tt/sparkle";
import { forwardRef, useState } from "react";

// Availability draft: https://trigger-talk-logic.lovable.app
// "Who can use it" and "when agents use it on their own" are split into two
// dropdowns. Auto-use for everyone requires the skill to be available to all
// members: a skill can't auto-trigger for people who can't use it.

type Access = "editors" | "members";
type AutoUse = "off" | "editors" | "all";

const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: "editors", label: "Only editors can use this skill" },
  { value: "members", label: "All members can use this skill" },
];

const AUTO_USE_OPTIONS: { value: AutoUse; label: string }[] = [
  { value: "off", label: "Agents use it only when someone selects it" },
  {
    value: "editors",
    label: "Agents can use it on their own in editors' conversations",
  },
  { value: "all", label: "Agents can use it on their own in any conversation" },
];

const AUTO_USE_REQUIRES_MEMBERS_MESSAGE =
  "Available if all members can use this skill.";

const SKILL_NAME = "UXWriting";

const SKILL_INSTRUCTIONS = `You are a UX writer for Dust. When asked to write or review product copy:
- Prefer short, plain sentences.
- Use sentence case for titles and buttons.
- Lead with what the user can do, not what the system does.`;

const SKILL_FILES = ["dust-voice-and-tone.md", "glossary.csv"];

// Input-bar trigger for the availability dropdowns: same shape as the sparkle
// Input (sm) with a trailing chevron, instead of an outline Button.
const SelectField = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ value, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "group flex h-8 w-full items-center gap-2 overflow-hidden rounded-xl border px-3 text-left text-base transition-colors md:text-sm",
      "border-border-form bg-muted text-foreground dark:bg-foreground/5",
      "focus-visible:border-border-form-active focus-visible:outline-hidden",
      "data-[state=open]:border-border-form-active data-[state=open]:bg-background dark:data-[state=open]:bg-transparent",
      className
    )}
    {...props}
  >
    <span className="min-w-0 flex-1 truncate">{value}</span>
    <Icon
      visual={ChevronDown}
      className="h-3.5 w-3.5 shrink-0 text-faint transition-transform group-data-[state=open]:rotate-180"
    />
  </button>
));
SelectField.displayName = "SelectField";

function AvailabilitySection() {
  const [access, setAccess] = useState<Access>("editors");
  const [autoUse, setAutoUse] = useState<AutoUse>("off");

  const onAccessChange = (value: Access) => {
    setAccess(value);
    if (value === "editors" && autoUse === "all") {
      setAutoUse("editors");
    }
  };

  const accessOption =
    ACCESS_OPTIONS.find((o) => o.value === access) ?? ACCESS_OPTIONS[0];
  const autoUseOption =
    AUTO_USE_OPTIONS.find((o) => o.value === autoUse) ?? AUTO_USE_OPTIONS[0];

  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold text-foreground">Availability</h3>
      <div className="flex flex-col gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SelectField
              value={accessOption.label}
              aria-label="Who can use this skill"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width)"
          >
            {ACCESS_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                label={option.label}
                onClick={() => onAccessChange(option.value)}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SelectField
              value={autoUseOption.label}
              aria-label="When agents can use this skill automatically"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width)"
          >
            {AUTO_USE_OPTIONS.map((option) => {
              const isDisabled = option.value === "all" && access === "editors";
              return (
                <DropdownMenuItem
                  key={option.value}
                  label={option.label}
                  onClick={() => setAutoUse(option.value)}
                  description={
                    isDisabled ? AUTO_USE_REQUIRES_MEMBERS_MESSAGE : undefined
                  }
                  disabled={isDisabled}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SkillSettingsSection() {
  const [name, setName] = useState(SKILL_NAME);
  const [description, setDescription] = useState(
    "Helps write and review clear, concise copy for Dust product interfaces."
  );
  const [selfImprove, setSelfImprove] = useState(true);

  return (
    <div className="space-y-4">
      <div className="space-y-1 pb-1">
        <h2 className="heading-lg font-semibold text-foreground">
          Skill settings
        </h2>
      </div>
      <div className="flex items-end gap-8">
        <div className="flex-grow space-y-2">
          <h3 className="text-base font-semibold text-foreground">Name</h3>
          <Input
            placeholder="Enter skill name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="group relative">
          <Avatar
            size="lg"
            visual={<PuzzlePiece01 className="h-8 w-8 text-muted-foreground" />}
          />
          <Button
            variant="outline"
            size="sm"
            icon={Edit04}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Description</h3>
        <div className="relative">
          <Input
            placeholder="Enter skill description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="pr-10"
          />
          <Button
            icon={Stars02}
            variant="outline"
            size="xs"
            className="absolute right-0 top-1/2 mr-1 h-7 w-7 -translate-y-1/2 rounded-lg p-0"
          />
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Editors</h3>
        <Button variant="outline" size="sm" icon={Users01} label="5 editors" />
      </div>
      <AvailabilitySection />
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">
          Self Improvement
        </h3>
        <div className="flex items-center gap-2">
          <SliderToggle
            selected={selfImprove}
            onClick={() => setSelfImprove((v) => !v)}
          />
          <span className="text-sm text-foreground">Self-improve</span>
          <Tooltip
            label="Dust will analyze how this skill is used and suggest improvements to its instructions over time."
            trigger={<InfoCircle className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      </div>
    </div>
  );
}

export default function SkillBuilder() {
  const editorClassName =
    "w-full resize-y overflow-auto rounded-xl border border-border bg-muted-background px-3 pb-8 pt-2 text-sm text-foreground outline-none focus:border-highlight-300 dark:bg-muted-background-night dark:border-border-night dark:text-foreground-night";

  return (
    <div className="flex h-screen w-full flex-col bg-background dark:bg-background-night">
      <BarHeader
        variant="default"
        className="mx-4"
        title={`Edit skill ${SKILL_NAME}`}
        centerActions={
          <Button
            variant="outline"
            size="sm"
            icon={ClockRewind}
            label="History"
            isSelect
          />
        }
        rightActions={<BarHeader.ButtonBar variant="close" />}
      />
      <ScrollArea className="flex-1">
        <div className="mx-auto space-y-10 p-8 2xl:max-w-5xl">
          <section className="space-y-4">
            <div className="space-y-1">
              <h3 className="heading-lg font-semibold text-foreground">
                When to use this skill
              </h3>
              <p className="text-sm text-muted-foreground">
                Tell the agent when it should use this skill.
              </p>
            </div>
            <textarea
              className={`${editorClassName} h-32`}
              defaultValue="Use when writing or reviewing any user-facing copy: buttons, empty states, errors, onboarding."
            />
          </section>
          <section className="flex flex-col gap-3">
            <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
              <div className="space-y-1">
                <h3 className="heading-lg font-semibold text-foreground">
                  Instructions
                </h3>
                <p className="text-sm text-muted-foreground">
                  Provide the guidelines the skill should follow when it runs.
                  Type "/" to attach knowledge, tools, or another skill.
                </p>
              </div>
              <Button variant="outline" label="Insert" icon={Plus} />
            </div>
            <textarea
              className={`${editorClassName} h-60`}
              defaultValue={SKILL_INSTRUCTIONS}
            />
          </section>
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="heading-lg font-semibold text-foreground">
                Files
              </h3>
              <p className="text-sm text-muted-foreground">
                Add files that will be available to the skill at runtime.
                Templates, schemas, scripts, or reference materials.
              </p>
            </div>
            <ContextItem.List>
              {SKILL_FILES.map((fileName) => (
                <ContextItem
                  key={fileName}
                  title={
                    <span className="text-sm font-normal">{fileName}</span>
                  }
                  visual={<ContextItem.Visual visual={File02} />}
                  hoverAction
                  action={<Button variant="ghost" icon={XClose} size="xs" />}
                />
              ))}
            </ContextItem.List>
          </div>
          <SkillSettingsSection />
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        className="mx-4 justify-between"
        leftActions={<Button variant="outline" label="Cancel" />}
        rightActions={<Button variant="highlight" label="Save" />}
      />
    </div>
  );
}
