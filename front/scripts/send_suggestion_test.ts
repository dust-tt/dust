import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

async function main() {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    "uTjggBDSoQ",
    "DevWkSpace"
  );

  const user = auth.getNonNullableUser();

  const conversation = await createConversation(auth, {
    title: "A workflow suggestion for you",
    visibility: "unlisted",
    spaceId: null,
    metadata: {
      reinforcedSkillNotification: {
        skillName: "activation_suggestion",
        skillId: "activation_suggestion",
      },
    },
  });

  // Content is echoed verbatim by Dust via the static reply mechanism.
  // quickReply directives are rendered as clickable buttons.
  const content = [
    "Here's something Dust can do for you right now:",
    "",
    "**Incident post-mortem** — Gather the most recent incident thread from Slack, compile it into a structured post-mortem doc, and save it to OneDrive.",
    "",
    ':quickReply[Do it]{message="Find the most recent incident thread in Slack, compile a structured post-mortem document with timeline, impact, root cause, and action items, then save it to OneDrive."} :quickReply[Suggest something else]{message="Suggest another workflow Dust can run for me based on my connected tools."}',
  ].join("\n");

  const res = await postUserMessage(auth, {
    conversation,
    content,
    mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
    context: {
      username: user.toJSON().username,
      fullName: user.toJSON().fullName,
      email: user.toJSON().email,
      profilePictureUrl: user.toJSON().image,
      timezone: "UTC",
      origin: "reinforced_skill_notification",
    },
    skipToolsValidation: true,
  });

  if (res.isErr()) {
    console.error("Failed:", JSON.stringify(res.error));
    process.exit(1);
  }

  await ConversationResource.upsertParticipation(auth, {
    conversation,
    action: "posted",
    user: user.toJSON(),
    lastReadAt: null,
  });

  console.log("/w/DevWkSpace/assistant/" + conversation.sId);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
