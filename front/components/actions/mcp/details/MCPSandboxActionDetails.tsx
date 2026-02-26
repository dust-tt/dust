import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { ToolExecutionDetailsProps } from "@app/components/actions/mcp/details/types";
import { isTextContent } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import {
  ActionDocumentTextIcon,
  Button,
  CodeBlock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  CommandLineIcon,
  cn,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

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

/**
 * Parse the raw text output to extract the exit code if present.
 * The sandbox tool formats output as: stdout + [stderr]\n... + [exit code: N]
 */
function parseExitCode(rawText: string): number | null {
  const match = rawText.match(/\[exit code: (\d+)\]\s*$/);
  return match ? parseInt(match[1], 10) : null;
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

  const exitCode = useMemo(() => {
    return rawOutputText ? parseExitCode(rawOutputText) : null;
  }, [rawOutputText]);

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

function ConversationView({
  command,
  summary,
  rawOutputText,
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
        <div className="flex flex-col gap-1">
          {command && (
            <CodeBlock className="language-bash max-h-20 overflow-y-auto">
              {command}
            </CodeBlock>
          )}
          {rawOutputText && (
            <CodeBlock className="language-text max-h-40 overflow-y-auto">
              {rawOutputText}
            </CodeBlock>
          )}
          <ExitCodeBadge exitCode={exitCode} />
        </div>
      )}
    </div>
  );
}

function SidebarView({
  command,
  summary,
  rawOutputText,
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
            <Collapsible defaultOpen={true}>
              <CollapsibleTrigger>
                <div
                  className={cn(
                    "text-foreground dark:text-foreground-night",
                    "flex flex-row items-center gap-x-2"
                  )}
                >
                  <span className="heading-base">Command</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="py-2">
                  <CodeBlock className="language-bash max-h-40 overflow-y-auto">
                    {command}
                  </CodeBlock>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Collapsible defaultOpen={!!rawOutputText}>
            <CollapsibleTrigger>
              <div
                className={cn(
                  "text-foreground dark:text-foreground-night",
                  "flex flex-row items-center gap-x-2"
                )}
              >
                <span className="heading-base">Output</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="py-2">
                {rawOutputText ? (
                  <CodeBlock className="language-text max-h-96 overflow-y-auto">
                    {rawOutputText}
                  </CodeBlock>
                ) : (
                  <p className="text-sm italic text-muted-foreground dark:text-muted-foreground-night">
                    {isRunning ? "Waiting for output…" : "(no output)"}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <ExitCodeBadge exitCode={exitCode} />
        </>
      )}
    </div>
  );
}
