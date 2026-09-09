import type { InternalPostMessageBody } from "@app/types/api/assistant";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  ConversationMetadata,
  ConversationOrigin,
  ConversationVisibility,
} from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type ConversationBootstrap = {
  conversation: {
    title: string;
    visibility: ConversationVisibility;
    metadata: ConversationMetadata;
  };
  message: InternalPostMessageBody;
};

const ANALYTICS_PANEL_BOOTSTRAP: ConversationBootstrap = {
  conversation: {
    // Hidden until the user writes in it, and titled up front so `ensureConversationTitle` does
    // not name it after the opening message.
    title: `Ask ${GLOBAL_AGENTS_SID.ANALYST}`,
    visibility: "test",
    metadata: { origin: "analytics_panel" },
  },
  message: {
    // Answered by a fixed greeting rather than a model, see `getStaticReplyForUserMessage`. The
    // tool instruction only applies if that greeting ever stops matching.
    content: `<dust_system>
The user just opened the @analyst panel on the workspace Analytics page.
Do NOT call any tools. Greet briefly and offer 2-3 example questions they could ask.
</dust_system>`,
    mentions: [{ configurationId: GLOBAL_AGENTS_SID.ANALYST }],
    context: {
      timezone: "UTC",
      profilePictureUrl: null,
    },
  },
};

export function getConversationBootstrap(
  origin: ConversationOrigin
): ConversationBootstrap {
  switch (origin) {
    case "analytics_panel":
      return ANALYTICS_PANEL_BOOTSTRAP;
    default:
      assertNever(origin);
  }
}
