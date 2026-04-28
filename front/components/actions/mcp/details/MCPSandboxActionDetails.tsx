import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import {
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  CommandLineIcon,
  cn,
  Markdown,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

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

  const actionName = isRunning
    ? "Executing command in sandbox"
    : "Executed command in sandbox";

  const viewProps: SandboxViewProps = {
    command,
    parsedSections,
    isRunning,
    exitCode,
  };

  return (
    <ActionDetailsWrapper
      displayContext={displayContext}
      actionName={actionName}
      visual={CommandLineIcon}
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
  parsedSections: SandboxSection[];
  isRunning: boolean;
  exitCode: number | null;
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

function SandboxOutput({ sections, exitCode, isRunning }: SandboxOutputProps) {
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
  parsedSections,
  isRunning,
  exitCode,
}: SandboxViewProps) {
  return (
    <div className="flex flex-col gap-3 pl-6">
      {command && <Markdown content={`\`\`\`bash\n${command}\n\`\`\``} />}
      {!isRunning && (
        <SandboxOutput
          sections={parsedSections}
          exitCode={exitCode}
          isRunning={isRunning}
        />
      )}
    </div>
  );
}

function SidebarView({
  command,
  parsedSections,
  isRunning,
  exitCode,
}: SandboxViewProps) {
  return (
    <div className="flex flex-col gap-4 py-4 pl-6">
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
    </div>
  );
}
