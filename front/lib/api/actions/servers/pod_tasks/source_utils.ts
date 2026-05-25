import type {
  ProjectTaskSourceInfo,
  ProjectTaskSourceType,
} from "@app/types/project_task";

const CONVERSATION_PATH_RE = /\/w\/[^/]+\/conversation\/([^/?#]+)/;

function inferSourceTypeFromHostname(hostname: string): ProjectTaskSourceType {
  if (hostname.includes("slack.com")) {
    return "slack";
  }
  if (hostname.includes("github.com")) {
    return "github";
  }
  if (hostname.includes("notion.so") || hostname.includes("notion.site")) {
    return "notion";
  }
  if (hostname.includes("atlassian.net") || hostname.includes("confluence")) {
    return "confluence";
  }
  if (
    hostname.includes("microsoft.com") ||
    hostname.includes("sharepoint.com") ||
    hostname.includes("office.com")
  ) {
    return "microsoft";
  }
  if (hostname.includes("google.com")) {
    return "gdrive";
  }
  return "project_knowledge";
}

export function inferProjectTaskSourceFromUrl({
  url,
  title,
}: {
  url: string;
  title: string;
}): ProjectTaskSourceInfo {
  try {
    const parsed = new URL(url);
    const conversationMatch = parsed.pathname.match(CONVERSATION_PATH_RE);
    if (conversationMatch) {
      return {
        sourceType: "project_conversation",
        sourceId: conversationMatch[1]!,
        sourceTitle: title,
        sourceUrl: url,
      };
    }

    return {
      sourceType: inferSourceTypeFromHostname(parsed.hostname.toLowerCase()),
      sourceId: url,
      sourceTitle: title,
      sourceUrl: url,
    };
  } catch {
    return {
      sourceType: "project_knowledge",
      sourceId: url,
      sourceTitle: title,
      sourceUrl: url,
    };
  }
}
