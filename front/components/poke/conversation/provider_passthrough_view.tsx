import type { PokeAgentMessageType } from "@app/types/poke";
import { removeNulls } from "@app/types/shared/utils/general";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  buttonVariants,
  ChevronDown,
  Chip,
  CodeBlock,
  cn,
} from "@dust-tt/sparkle";

interface ProviderPassthroughEntry {
  block: unknown;
  key: string;
  provider: string;
  step: number;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getProviderPassthroughEntries(
  contents: PokeAgentMessageType["contents"]
): ProviderPassthroughEntry[] {
  return removeNulls(
    contents.map(({ content, step }, contentIndex) => {
      if (content.type !== "provider_passthrough") {
        return null;
      }

      return {
        block: content.value.block,
        key: `${step}-${contentIndex}`,
        provider: content.value.provider,
        step,
      };
    })
  );
}

function getToolSearchResultSummary(content: unknown): string | null {
  if (!isObjectRecord(content) || typeof content.type !== "string") {
    return null;
  }

  if (
    content.type === "tool_search_tool_search_result" &&
    Array.isArray(content.tool_references)
  ) {
    const toolNames = content.tool_references.flatMap((toolReference) => {
      if (
        isObjectRecord(toolReference) &&
        typeof toolReference.tool_name === "string"
      ) {
        return [toolReference.tool_name];
      }

      return [];
    });

    if (toolNames.length === 0) {
      return "0 tools found";
    }

    return `${toolNames.length} tool${pluralize(toolNames.length)} found: ${toolNames.join(", ")}`;
  }

  if (
    content.type === "tool_search_tool_result_error" &&
    typeof content.error_code === "string"
  ) {
    return `error: ${content.error_code}`;
  }

  return content.type;
}

function getProviderPassthroughTitle(entry: ProviderPassthroughEntry): string {
  const { block, provider } = entry;

  if (!isObjectRecord(block) || typeof block.type !== "string") {
    return `${provider} provider_passthrough`;
  }

  if (
    block.type === "server_tool_use" &&
    typeof block.name === "string" &&
    isObjectRecord(block.input) &&
    typeof block.input.query === "string"
  ) {
    return `${block.name}: ${block.input.query}`;
  }

  if (block.type === "tool_search_tool_result") {
    const summary = getToolSearchResultSummary(block.content);
    return summary
      ? `tool_search_tool_result: ${summary}`
      : "tool_search_tool_result";
  }

  return `${provider} ${block.type}`;
}

function getProviderPassthroughKind(entry: ProviderPassthroughEntry): string {
  if (!isObjectRecord(entry.block) || typeof entry.block.type !== "string") {
    return "passthrough";
  }

  if (entry.block.type === "server_tool_use") {
    return "call";
  }

  if (entry.block.type === "tool_search_tool_result") {
    return "result";
  }

  return "passthrough";
}

interface ProviderPassthroughViewProps {
  entry: ProviderPassthroughEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

export function ProviderPassthroughView({
  entry,
  isExpanded,
  onToggle,
}: ProviderPassthroughViewProps) {
  const title = getProviderPassthroughTitle(entry);
  const kind = getProviderPassthroughKind(entry);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${title} details`}
        className={cn(
          "mt-2 flex w-full items-center gap-2",
          "rounded-md border border-separator bg-muted-background",
          "cursor-pointer p-2 text-left transition-colors hover:bg-background",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "motion-reduce:transition-none"
        )}
      >
        <span className="shrink-0">
          <span
            aria-hidden="true"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              isIconOnly: true,
              press: false,
            })}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform motion-reduce:transition-none",
                !isExpanded ? "-rotate-90" : null
              )}
            />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
            —
          </span>
          <Chip label={`Step ${entry.step}`} />
          <span
            className="min-w-0 truncate text-sm font-medium text-foreground"
            title={title}
          >
            {title}
          </span>
          <Chip
            color={kind === "call" ? "highlight" : "success"}
            label={kind}
            size="xs"
          />
        </span>
      </button>
      {isExpanded && (
        <div className="ml-9 mt-2 overflow-hidden rounded-md border border-separator bg-background">
          <CodeBlock wrapLongLines className="language-json">
            {JSON.stringify(entry.block, null, 2)}
          </CodeBlock>
        </div>
      )}
    </div>
  );
}
