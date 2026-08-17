import type { SandboxEnvVarKind } from "@app/types/sandbox/env_var";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

export const ALLOWED_DOMAINS_HELPER_TEXT =
  "Use exact domains such as api.openai.com or wildcards such as *.mistral.ai.";

export function labelForKind(kind: SandboxEnvVarKind): string {
  switch (kind) {
    case "config":
      return "Config";
    case "https_secret":
      return "HTTPS secret";
    default:
      assertNeverAndIgnore(kind);
      return "";
  }
}
