import {
  assertNever,
  CLAUDE_2_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG,
  GEMINI_2_5_PRO_MODEL_CONFIG,
  GLOBAL_AGENTS_SID,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_1_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
  GPT_5_MODEL_CONFIG,
  GPT_5_NANO_MODEL_CONFIG,
  MISTRAL_LARGE_MODEL_CONFIG,
  MISTRAL_MEDIUM_MODEL_CONFIG,
  MISTRAL_SMALL_MODEL_CONFIG,
  O1_MINI_MODEL_CONFIG,
  O1_MODEL_CONFIG,
  O3_MODEL_CONFIG,
} from "@app/types";

type AgentMetadata = {
  sId: string;
  name: string;
  description: string;
  pictureUrl: string;
};

export function getGlobalAgentMetadata(sId: GLOBAL_AGENTS_SID): AgentMetadata {
  switch (sId) {
    case GLOBAL_AGENTS_SID.HELPER:
      return {
        sId: GLOBAL_AGENTS_SID.HELPER,
        name: "help",
        description: "Help on how to use Dust",
        pictureUrl:
          "https://dust.tt/static/systemavatar/helper_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GPT35_TURBO:
      return {
        sId: GLOBAL_AGENTS_SID.GPT35_TURBO,
        name: "gpt3.5-turbo",
        description: GPT_3_5_TURBO_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/gpt3_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GPT4:
      return {
        sId: GLOBAL_AGENTS_SID.GPT4,
        name: "gpt4",
        description: GPT_4_1_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/gpt4_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GPT5:
      return {
        sId: GLOBAL_AGENTS_SID.GPT5,
        name: "gpt5",
        description: GPT_5_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/gpt5_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GPT5_THINKING:
      return {
        sId: GLOBAL_AGENTS_SID.GPT5_THINKING,
        name: "gpt5-thinking",
        description: GPT_5_MINI_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/gpt5_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GPT5_NANO:
      return {
        sId: GLOBAL_AGENTS_SID.GPT5_NANO,
        name: "gpt5-nano",
        description: GPT_5_NANO_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/gpt5_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GPT5_MINI:
      return {
        sId: GLOBAL_AGENTS_SID.GPT5_MINI,
        name: "gpt5-mini",
        description: GPT_5_MINI_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/gpt5_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.O1:
      return {
        sId: GLOBAL_AGENTS_SID.O1,
        name: "o1",
        description: O1_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.O1_MINI:
      return {
        sId: GLOBAL_AGENTS_SID.O1_MINI,
        name: "o1-mini",
        description: O1_MINI_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.O1_HIGH_REASONING:
      return {
        sId: GLOBAL_AGENTS_SID.O1_HIGH_REASONING,
        name: "o1-high-reasoning",
        description: O1_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.O3_MINI:
      return {
        sId: GLOBAL_AGENTS_SID.O3_MINI,
        name: "o3-mini",
        description: O3_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.O3:
      return {
        sId: GLOBAL_AGENTS_SID.O3,
        name: "o3",
        description: O3_MODEL_CONFIG.description,
        pictureUrl: "https://dust.tt/static/systemavatar/o1_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.CLAUDE_INSTANT:
      return {
        sId: GLOBAL_AGENTS_SID.CLAUDE_INSTANT,
        name: "claude-instant",
        description: CLAUDE_INSTANT_DEFAULT_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/claude_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.CLAUDE_2:
      return {
        sId: GLOBAL_AGENTS_SID.CLAUDE_2,
        name: "claude-2",
        description: CLAUDE_2_DEFAULT_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/claude_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU:
      return {
        sId: GLOBAL_AGENTS_SID.CLAUDE_3_HAIKU,
        name: "claude-3-haiku",
        description: CLAUDE_3_HAIKU_DEFAULT_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/claude_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.CLAUDE_3_OPUS:
      return {
        sId: GLOBAL_AGENTS_SID.CLAUDE_3_OPUS,
        name: "claude-3-opus",
        description: CLAUDE_3_OPUS_DEFAULT_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/claude_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.CLAUDE_3_SONNET:
      return {
        sId: GLOBAL_AGENTS_SID.CLAUDE_3_SONNET,
        name: "claude-3.5",
        description: CLAUDE_3_5_SONNET_DEFAULT_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/claude_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.CLAUDE_4_SONNET:
      return {
        sId: GLOBAL_AGENTS_SID.CLAUDE_4_SONNET,
        name: "claude-4-sonnet",
        description: CLAUDE_4_SONNET_DEFAULT_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/claude_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET:
      return {
        sId: GLOBAL_AGENTS_SID.CLAUDE_3_7_SONNET,
        name: "claude-3.7",
        description: CLAUDE_3_7_SONNET_DEFAULT_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/claude_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.MISTRAL_LARGE:
      return {
        sId: GLOBAL_AGENTS_SID.MISTRAL_LARGE,
        name: "mistral",
        description: MISTRAL_LARGE_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.MISTRAL_MEDIUM:
      return {
        sId: GLOBAL_AGENTS_SID.MISTRAL_MEDIUM,
        name: "mistral-medium",
        description: MISTRAL_MEDIUM_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.MISTRAL_SMALL:
      return {
        sId: GLOBAL_AGENTS_SID.MISTRAL_SMALL,
        name: "mistral-small",
        description: MISTRAL_SMALL_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/mistral_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GEMINI_PRO:
      return {
        sId: GLOBAL_AGENTS_SID.GEMINI_PRO,
        name: "gemini-pro",
        description: GEMINI_2_5_PRO_MODEL_CONFIG.description,
        pictureUrl:
          "https://dust.tt/static/systemavatar/gemini_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.DEEPSEEK_R1:
      return {
        sId: GLOBAL_AGENTS_SID.DEEPSEEK_R1,
        name: "DeepSeek R1",
        description:
          "DeepSeek's reasoning model. Served from a US inference provider. Cannot use any tools",
        pictureUrl:
          "https://dust.tt/static/systemavatar/deepseek_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.SLACK:
      return {
        sId: GLOBAL_AGENTS_SID.SLACK,
        name: "slack",
        description: "An agent with context on your Slack Channels.",
        pictureUrl: "https://dust.tt/static/systemavatar/slack_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GOOGLE_DRIVE:
      return {
        sId: GLOBAL_AGENTS_SID.GOOGLE_DRIVE,
        name: "googledrive",
        description: "An agent with context on your Google Drives.",
        pictureUrl: "https://dust.tt/static/systemavatar/drive_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.NOTION:
      return {
        sId: GLOBAL_AGENTS_SID.NOTION,
        name: "notion",
        description: "An agent with context on your Notion Spaces.",
        pictureUrl:
          "https://dust.tt/static/systemavatar/notion_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.GITHUB:
      return {
        sId: GLOBAL_AGENTS_SID.GITHUB,
        name: "github",
        description:
          "An agent with context on your Github Issues and Discussions.",
        pictureUrl:
          "https://dust.tt/static/systemavatar/github_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.INTERCOM:
      return {
        sId: GLOBAL_AGENTS_SID.INTERCOM,
        name: "intercom",
        description: "An agent with context on your Intercom Help Center data.",
        pictureUrl:
          "https://dust.tt/static/systemavatar/intercom_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.DUST:
      return {
        sId: GLOBAL_AGENTS_SID.DUST,
        name: "dust",
        description: "An agent with context on your company data.",
        pictureUrl: "https://dust.tt/static/systemavatar/dust_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.DUST_DEEP:
      return {
        sId: GLOBAL_AGENTS_SID.DUST_DEEP,
        name: "dust-deep",
        description:
          "Deep research agent with company data, web search, browsing, Content Creation, and data warehouses.",
        pictureUrl:
          "https://dust.tt/static/systemavatar/dust-deep_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.DUST_TASK:
      return {
        sId: GLOBAL_AGENTS_SID.DUST_TASK,
        name: "dust-task",
        description:
          "Task sub-agent for focused research using company data, web search, browsing, and data warehouses.",
        pictureUrl:
          "https://dust.tt/static/systemavatar/dust-task_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY:
      return {
        sId: GLOBAL_AGENTS_SID.DUST_BROWSER_SUMMARY,
        name: "dust-browser-summary",
        description: "A agent that summarizes web page content.",
        pictureUrl:
          "https://dust.tt/static/systemavatar/dust-task_avatar_full.png",
      };
    case GLOBAL_AGENTS_SID.DUST_PLANNING:
      return {
        sId: GLOBAL_AGENTS_SID.DUST_PLANNING,
        name: "dust-planning",
        description: "A agent that plans research tasks.",
        pictureUrl:
          "https://dust.tt/static/systemavatar/dust-task_avatar_full.png",
      };
    default:
      assertNever(sId);
  }
}
