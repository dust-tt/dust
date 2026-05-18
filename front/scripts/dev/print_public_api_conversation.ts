/**
 * Print one conversation in the same shape as
 * GET /v1/w/:wId/spaces/:spaceId/conversations (after backward-compat mapping).
 *
 * From repo root / front directory:
 *   cd front && npx tsx scripts/dev/print_public_api_conversation.ts --wId <workspaceSId> --cId <conversationSId>
 *
 * Or paste the imports + an async main() into a scratch file (set wId / cId).
 * Do not use top-level await — tsx often emits CJS, which does not support it.
 */

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import { addBackwardCompatibleConversationFields } from "@app/lib/api/v1/backward_compatibility";
import { Authenticator } from "@app/lib/auth";
import { getConversationRoute } from "@app/lib/utils/router";
import type { ConversationType } from "@app/types/assistant/conversation";
import parseArgs from "minimist";

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const wId = argv.wId as string | undefined;
  const cId = argv.cId as string | undefined;
  const includeDeleted = argv.includeDeleted !== "false";

  if (!wId || !cId) {
    console.error(
      "Usage: npx tsx scripts/dev/print_public_api_conversation.ts --wId <workspaceSId> --cId <conversationSId> [--includeDeleted false]"
    );
    process.exit(1);
  }

  const auth = await Authenticator.internalAdminForWorkspace(wId, {
    dangerouslyRequestAllGroups: true,
  });

  const conversationRes = await getConversation(auth, cId, includeDeleted);
  if (conversationRes.isErr()) {
    throw new Error(conversationRes.error.message);
  }

  const c = conversationRes.value;

  // Same pipeline as spaces/[spaceId]/conversations/index.ts (list map + backward compat).
  const responseConversation = {
    ...c,
    url: getConversationRoute(wId, c.sId, undefined, config.getAppUrl()),
  };
  const publicConversation = addBackwardCompatibleConversationFields(
    responseConversation as ConversationType
  );

  console.log(JSON.stringify(publicConversation, null, 2));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
