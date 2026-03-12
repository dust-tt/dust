import config from "@app/lib/api/config";
import { LangfuseClient } from "@langfuse/client";

let langfuseClient: LangfuseClient | null = null;

export function getLangfuseClient(): LangfuseClient | null {
  if (!config.isLangfuseEnabled()) {
    return null;
  }

  langfuseClient ??= new LangfuseClient(config.getLangfuseClientConfig());

  return langfuseClient;
}
