import type { InternalPostMessageBody } from "@app/types/api/assistant";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationMetadata,
  ConversationVisibility,
} from "@app/types/assistant/conversation";

// Answered by a fixed greeting rather than a model, see `getStaticReplyForUserMessage`. The tool
// instruction only applies if that greeting ever stops matching.
export const ANALYTICS_PANEL_BOOTSTRAP_MESSAGE: InternalPostMessageBody = {
  content: `<dust_system>
The user just opened the @analyst panel on the workspace Analytics page.
Do NOT call any tools. Greet briefly and offer 2-3 example questions they could ask.
</dust_system>`,
  mentions: [{ configurationId: GLOBAL_AGENTS_SID.ANALYST }],
  context: {
    timezone: "UTC",
    profilePictureUrl: null,
  },
};

// Hidden until the user writes in it, and titled up front so `ensureConversationTitle` does not
// name it after the bootstrap message.
export const ANALYTICS_PANEL_CONVERSATION_INIT: {
  title: string;
  visibility: ConversationVisibility;
  metadata: ConversationMetadata;
} = {
  title: `Ask ${GLOBAL_AGENTS_SID.ANALYST}`,
  visibility: "test",
  metadata: { origin: "analytics_panel" },
};
