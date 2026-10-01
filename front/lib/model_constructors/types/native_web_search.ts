import type { Host } from "@app/lib/model_constructors/types/hosts";
import {
  ANTHROPIC_HOST,
  OPENAI_RESPONSES_HOST,
} from "@app/lib/model_constructors/types/hosts";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

const PROVIDER_NATIVE_WEB_SEARCH =
  "provider_native_web_search" as const satisfies WhitelistableFeature;

// Hosts whose API exposes a server-side web search tool we drive. Gating on the
// host rather than the provider id deliberately excludes AGENT_PLATFORM_HOST
// (Vertex), which shares Anthropic's provider id and input converter: server
// tool support there is unverified, and the regional endpoints exist for
// workspaces that do not want queries leaving the region. Adding a host here is
// the single switch to flip once verified.
const NATIVE_WEB_SEARCH_HOSTS: ReadonlySet<Host> = new Set<Host>([
  ANTHROPIC_HOST,
  OPENAI_RESPONSES_HOST,
]);

/**
 * Whether the provider's own web search replaces Dust's `websearch` tool for
 * this request. False for every other host by construction.
 */
export function isNativeWebSearchEnabled({
  host,
  featureFlags,
}: {
  host: Host;
  featureFlags: WhitelistableFeature[];
}): boolean {
  return (
    featureFlags.includes(PROVIDER_NATIVE_WEB_SEARCH) &&
    NATIVE_WEB_SEARCH_HOSTS.has(host)
  );
}

// Added to the system prompt only when the native tool is in the request, as a
// trailing block outside the cached system prefix. Two jobs: tell the model
// search is built in rather than a tool it calls, and neutralize the many
// prompts that still name a `websearch` tool it no longer has — the deep-dive
// sub-agent instructions, the `http_client` tool description, and user-authored
// agent instructions we cannot edit. Citations need no instruction: the provider
// attaches them to its own results and we render them as markdown links.
export const NATIVE_WEB_SEARCH_INSTRUCTION =
  "You can search the web directly: web search is a built-in capability, not a " +
  "tool you call. Search whenever the request needs current information. " +
  "Some instructions you were given may refer to a `websearch` tool; that tool " +
  "is not available to you, so use your built-in web search instead. To read a " +
  "full page rather than a search snippet, use the web browsing tool.";
