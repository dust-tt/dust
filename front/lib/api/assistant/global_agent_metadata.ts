import {
  assertNever,
  CLAUDE_2_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG,
  GLOBAL_AGENTS_SID,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  O1_HIGH_REASONING_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MINI_HIGH_REASONING_MODEL_CONFIG,
  O3_MODEL_CONFIG,
} from "@app/types";

type AgentMetadata = {
  sId: string;
  name: string;
  description: string;
  pictureUrl: string;
};

function _getHelperGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.HELPER,
    name: "help",
    description: "Help on how to use Dust",
    pictureUrl: "https://dust.tt/static/systemavatar/helper_avatar_full.png",
  };
}

function _getGPT35TurboGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.GPT35_TURBO,
    name: "gpt3.5-turbo",
    description: GPT_3_5_TURBO_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
  };
}

function _getGPT4GlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.GPT4,
    name: "gpt4",
    description: GPT_4_1_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
  };
}

function _getO3MiniGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.O3_MINI,
    name: "o3-mini",
    description: O3_MINI_HIGH_REASONING_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
  };
}

function _getO1GlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.O1,
    name: "o1",
    description: O1_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
  };
}

function _getO1MiniGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.O1_MINI,
    name: "o1-mini",
    description: O1_MINI_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
  };
}

function _getO1HighReasoningGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.O1_HIGH_REASONING,
    name: "o1-high-reasoning",
    description: O1_HIGH_REASONING_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
  };
}

function _getO3GlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.O3,
    name: "o3",
    description: O3_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
  };
}

function _getClaudeInstantGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
    name: "claude-instant",
    description: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
  };
}

function _getClaude2GlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.CLAUDE_2,
    name: "claude-2",
    description: CLAUDE_2_DEFAULT_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
  };
}

function _getClaude3HaikuGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
    name: "claude-3-haiku",
    description: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
  };
}

function _getClaude3OpusGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
    name: "claude-3-opus",
    description: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
  };
}

function _getClaude3GlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
    name: "claude-3.5",
    description: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
  };
}

function _getClaude4SonnetGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.CLAUDE_4_SONNET,
    name: "claude-4-sonnet",
    description: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
  };
}

function _getClaude3_7GlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
    name: "claude-3.7",
    description: CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/claude_avatar_full.png",
  };
}

function _getMistralLargeGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.MISTRAL_LARGE,
    name: "mistral",
    description: MISTRAL_LARGE_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
  };
}

function _getMistralMediumGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
    name: "mistral-medium",
    description: MISTRAL_MEDIUM_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
  };
}

function _getMistralSmallGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.MISTRAL_SMALL,
    name: "mistral-small",
    description: MISTRAL_SMALL_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
  };
}

function _getGeminiProGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.GEMINI_PRO,
    name: "gemini-pro",
    description: GEMINI_2_5_PRO_PREVIEW_MODEL_CONFIG.description,
    pictureUrl: "https://dust.tt/static/systemavatar/gemini_avatar_full.png",
  };
}

function _getDeepSeekR1GlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.DEEPSEEK_R1,
    name: "DeepSeek R1",
    description:
      "DeepSeek's reasoning model. Served from a US inference provider. Cannot use any tools",
    pictureUrl: "https://dust.tt/static/systemavatar/deepseek_avatar_full.png",
  };
}

function _getGoogleDriveGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
    name: "googledrive",
    description: "An agent with context on your Google Drives.",
    pictureUrl: "https://dust.tt/static/systemavatar/drive_avatar_full.png",
  };
}

function _getSlackGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.SLACK,
    name: "slack",
    description: "An agent with context on your Slack Channels.",
    pictureUrl: "https://dust.tt/static/systemavatar/slack_avatar_full.png",
  };
}

function _getGithubGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.GITHUB,
    name: "github",
    description: "An agent with context on your Github Issues and Discussions.",
    pictureUrl: "https://dust.tt/static/systemavatar/github_avatar_full.png",
  };
}

function _getNotionGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.NOTION,
    name: "notion",
    description: "An agent with context on your Notion Spaces.",
    pictureUrl: "https://dust.tt/static/systemavatar/notion_avatar_full.png",
  };
}

function _getIntercomGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.INTERCOM,
    name: "intercom",
    description: "An agent with context on your Intercom Help Center data.",
    pictureUrl: "https://dust.tt/static/systemavatar/intercom_avatar_full.png",
  };
}

function _getDustGlobalAgent(): AgentMetadata {
  return {
    sId: GLOBAL_AGENTS_SID.DUST,
    name: "dust",
    description: "An agent with context on your company data.",
    pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
  };
}

/**
 * Get metadata for a specific global agent by sId
 */
export function getGlobalAgentMetadata(sId: GLOBAL_AGENTS_SID): AgentMetadata {
  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      return _getHelperGlobalAgent();
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      return _getGPT35TurboGlobalAgent();
    case GLOBAL_AGENTS_SID.GPT4:
      return _getGPT4GlobalAgent();
    case GLOBAL_AGENTS_SID.O1:
      return _getO1GlobalAgent();
    case GLOBAL_AGENTS_SID.O1_MINI:
      return _getO1MiniGlobalAgent();
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
      return _getO1HighReasoningGlobalAgent();
    case GLOBAL_AGENTS_SID.O3_MINI:
      return _getO3MiniGlobalAgent();
    case GLOBAL_AGENTS_SID.O3:
      return _getO3GlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      return _getClaudeInstantGlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      return _getClaude2GlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
      return _getClaude3HaikuGlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
      return _getClaude3OpusGlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
      return _getClaude3GlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_4_SONNET:
      return _getClaude4SonnetGlobalAgent();
    case GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
      return _getClaude3_7GlobalAgent();
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
      return _getMistralLargeGlobalAgent();
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
      return _getMistralMediumGlobalAgent();
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      return _getMistralSmallGlobalAgent();
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      return _getGeminiProGlobalAgent();
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      return _getDeepSeekR1GlobalAgent();
    case GLOBAL_AGENTS_SID.SLACK:
      return _getSlackGlobalAgent();
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      return _getGoogleDriveGlobalAgent();
    case GLOBAL_AGENTS_SID.NOTION:
      return _getNotionGlobalAgent();
    case GLOBAL_AGENTS_SID.GITHUB:
      return _getGithubGlobalAgent();
    case GLOBAL_AGENTS_SID.INTERCOM:
      return _getIntercomGlobalAgent();
    case GLOBAL_AGENTS_SID.DUST:
      return _getDustGlobalAgent();
    default:
      assertNever(sId);
  }
}
