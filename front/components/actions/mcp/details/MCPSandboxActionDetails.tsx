import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  ActionDocumentTextIcon,
  Button,
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  CommandLineIcon,
  cn,
  Markdown,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

type SandboxSectionType =
  | "stdout"
  | "stderr"
  | "exit_code"
  | "network_proxy_logs";

interface SandboxSection {
  type: SandboxSectionType;
  content: string;
}

const SECTION_REGEX =
  /<(stdout|stderr|exit_code|network_proxy_logs)>([\s\S]*?)<\/\1>/g;

const COLLAPSE_LINE_THRESHOLD = 20;
const COLLAPSE_CHAR_THRESHOLD = 1500;

function parseSandboxOutput(rawText: string): SandboxSection[] {
  const sections: SandboxSection[] = [];
  for (const match of rawText.matchAll(SECTION_REGEX)) {
    const [, type, content] = match;
    sections.push({
      type: type as SandboxSectionType,
      content: content.replace(/^\n|\n$/g, ""),
    });
  }
  return sections;
}

function isLongContent(content: string): boolean {
  if (content.length > COLLAPSE_CHAR_THRESHOLD) {
    return true;
  }
  const lines = content.split("\n").length;
  return lines > COLLAPSE_LINE_THRESHOLD;
}

function sectionLabel(type: SandboxSectionType): string {
  switch (type) {
    case "stdout":
      return "stdout";
    case "stderr":
      return "stderr";
    case "exit_code":
      return "exit code";
    case "network_proxy_logs":
      return "network proxy logs";
    default:
      assertNeverAndIgnore(type);
      return "";
  }
}

const STORAGE_KEY = "dust:sandbox:rawMode";

function getStoredRawMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function setStoredRawMode(value: boolean): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, String(value));
  }
}

/**
 * Extract a clean, short command name from a potentially complex command string.
 * Strips heredocs, pipes, semicolons, and env vars to find the core binary/script.
 */
function extractCommandName(command: string): string {
  const firstLine = command.trim().split("\n")[0];

  // Strip heredoc markers (e.g. `python3 << 'EOF'` → `python3`)
  const beforeHeredoc = firstLine.split("<<")[0].trim();

  // Strip pipes and take the first command
  const firstCmd = beforeHeredoc.split("|")[0].trim();

  // Strip leading env vars (e.g. `FOO=bar python3` → `python3`)
  const tokens = firstCmd.split(/\s+/);
  const cmdToken = tokens.find((t) => !t.includes("=")) ?? tokens[0];

  // Strip path (e.g. `/usr/bin/python3` → `python3`)
  const basename = cmdToken.split("/").pop() ?? cmdToken;

  return basename;
}

function deriveSummary(command: string, exitCode: number | null): string {
  const name = extractCommandName(command);

  if (exitCode !== null && exitCode !== 0) {
    return `\`${name}\` failed with exit code ${exitCode}.`;
  }

  return `Ran \`${name}\` successfully.`;
}

function parseExitCode(sections: SandboxSection[]): number | null {
  const section = sections.find((s) => s.type === "exit_code");
  if (!section) {
    return null;
  }
  const parsed = parseInt(section.content.trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function MCPSandboxActionDetails({
  displayContext,
  toolParams,
  toolOutput,
}: ToolExecutionDetailsProps) {
  const [isRawMode, setIsRawMode] = useState(getStoredRawMode);

  const command =
    typeof toolParams.command === "string" ? toolParams.command : null;

  const rawOutputText = useMemo(() => {
    if (!toolOutput) {
      return null;
    }
    const textBlocks = toolOutput.filter(isTextContent);
    return textBlocks.map((b) => b.text).join("\n") || null;
  }, [toolOutput]);

  const parsedSections = useMemo(() => {
    return rawOutputText ? parseSandboxOutput(rawOutputText) : [];
  }, [rawOutputText]);

  const exitCode = useMemo(
    () => parseExitCode(parsedSections),
    [parsedSections]
  );

  const isRunning = toolOutput === null;

  const summary = useMemo(() => {
    if (!command) {
      return "Executed command in sandbox";
    }
    return deriveSummary(command, exitCode);
  }, [command, exitCode]);

  const toggleRawMode = useCallback(() => {
    setIsRawMode((prev) => {
      const next = !prev;
      setStoredRawMode(next);
      return next;
    });
  }, []);

  const actionName = isRunning
    ? "Executing command in sandbox"
    : "Executed command in sandbox";

  const viewProps: SandboxViewProps = {
    command,
    summary,
    rawOutputText,
    parsedSections,
    isRawMode,
    isRunning,
    exitCode,
  };

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={CommandLineIcon}
      headerAction={
        !isRunning ? (
          <ToggleButton isRawMode={isRawMode} onToggle={toggleRawMode} />
        ) : undefined
      }
    >
      {displayContext === "conversation" ? (
        <ConversationView {...viewProps} />
      ) : (
        <SidebarView {...viewProps} />
      )}
    </ActionDetailsWrapper>
  );
}

interface SandboxViewProps {
  command: string | null;
  summary: string;
  rawOutputText: string | null;
  parsedSections: SandboxSection[];
  isRawMode: boolean;
  isRunning: boolean;
  exitCode: number | null;
}

interface ToggleButtonProps {
  isRawMode: boolean;
  onToggle: () => void;
}

function ToggleButton({ isRawMode, onToggle }: ToggleButtonProps) {
  return (
    <Button
      size="xs"
      variant="ghost"
      label={isRawMode ? "Show summary" : "Show code"}
      icon={isRawMode ? ActionDocumentTextIcon : CommandLineIcon}
      onClick={onToggle}
    />
  );
}

interface CommandPreviewProps {
  command: string;
}

function CommandPreview({ command }: CommandPreviewProps) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-xs dark:bg-muted-night">
      {extractCommandName(command)}
    </code>
  );
}

interface ExitCodeBadgeProps {
  exitCode: number | null;
}

function ExitCodeBadge({ exitCode }: ExitCodeBadgeProps) {
  if (exitCode === null) {
    return null;
  }

  return (
    <span
      className={cn(
        "text-xs font-medium",
        exitCode === 0
          ? "text-success dark:text-success-night"
          : "text-warning dark:text-warning-night"
      )}
    >
      exit code: {exitCode}
    </span>
  );
}

interface SectionBlockProps {
  type: SandboxSectionType;
  content: string;
  defaultOpen: boolean;
}

function SectionBlock({ type, content, defaultOpen }: SectionBlockProps) {
  const isStderr = type === "stderr";
  const isExitCode = type === "exit_code";

  if (isExitCode) {
    return null;
  }

  const labelClass = cn(
    "font-mono text-xs uppercase tracking-wide",
    isStderr
      ? "text-warning dark:text-warning-night"
      : "text-muted-foreground dark:text-muted-foreground-night"
  );

  if (!isLongContent(content)) {
    return (
      <div className="flex flex-col gap-1">
        <span className={labelClass}>{sectionLabel(type)}</span>
        <CodeBlock wrapLongLines>{content}</CodeBlock>
      </div>
    );
  }

  const lineCount = content.split("\n").length;

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger>
        <span className={labelClass}>
          {sectionLabel(type)} · {lineCount} lines
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-1">
          <CodeBlock wrapLongLines>{content}</CodeBlock>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SandboxOutputProps {
  sections: SandboxSection[];
  exitCode: number | null;
  isRunning: boolean;
}

function SandboxOutput({
  sections,
  exitCode,
  isRunning,
}: SandboxOutputProps) {
  const renderable = sections.filter((s) => s.type !== "exit_code");

  if (renderable.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground dark:text-muted-foreground-night">
        {isRunning ? "Waiting for output…" : "No output"}
      </p>
    );
  }

  const failed = exitCode !== null && exitCode !== 0;

  return (
    <div className="flex flex-col gap-3">
      {renderable.map((section, idx) => (
        <SectionBlock
          key={`${section.type}-${idx}`}
          type={section.type}
          content={section.content}
          defaultOpen={!(failed && section.type === "stdout")}
        />
      ))}
      <ExitCodeBadge exitCode={exitCode} />
    </div>
  );
}

function ConversationView({
  command,
  summary,
  parsedSections,
  isRawMode,
  isRunning,
  exitCode,
}: SandboxViewProps) {
  return (
    <div className="flex flex-col gap-2 pl-6">
      {isRunning && command && (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Running <CommandPreview command={command} />
        </p>
      )}

      {!isRunning && !isRawMode && (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {summary}
        </p>
      )}

      {!isRunning && isRawMode && (
        <div className="flex flex-col gap-3">
          {command && <Markdown content={`\`\`\`bash\n${command}\n\`\`\``} />}
          <SandboxOutput
            sections={parsedSections}
            exitCode={exitCode}
            isRunning={isRunning}
          />
        </div>
      )}
    </div>
  );
}

function SidebarView({
  command,
  summary,
  parsedSections,
  isRawMode,
  isRunning,
  exitCode,
}: SandboxViewProps) {
  return (
    <div className="flex flex-col gap-4 py-4 pl-6">
      {!isRawMode && (
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {isRunning && command
            ? `Running \`${command}\``
            : isRunning
              ? "Running command…"
              : summary}
        </p>
      )}

      {isRawMode && (
        <>
          {command && (
            <div>
              <span className="font-medium text-foreground dark:text-foreground-night">
                Command
              </span>
              <div className="py-2">
                <Markdown content={`\`\`\`bash\n${command}\n\`\`\``} />
              </div>
            </div>
          )}

          <div>
            <span className="font-medium text-foreground dark:text-foreground-night">
              Output
            </span>
            <div className="py-2">
              <SandboxOutput
                sections={parsedSections}
                exitCode={exitCode}
                isRunning={isRunning}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
