import type { AgentMessageType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { Command } from "commander";
import * as readlinePromises from "readline/promises";
import jaroWinkler from "talisman/metrics/jaro-winkler";

import { State } from "@app/state";

async function readStdin(): Promise<string> {
  const rl = readlinePromises.createInterface({
    input: process.stdin,
  });

  let data = "";
  for await (const line of rl) {
    data += line + "\n";
  }
  return data.trim();
}

const program = new Command();

program
  .command("agents")
  .description("Manage agents")
  .addCommand(
    new Command("refresh")
      .description("Refresh agents state")
      .action(async () => {
        const state = new State();
        await state.init();
        await state.refreshAgentList();
      })
  )
  .addCommand(
    new Command("list").description("List agents").action(async () => {
      const state = new State();
      await state.init();
      const data = state.agents.map((a) => {
        return {
          sId: a.sId,
          name: a.name,
          description: a.description,
        };
      });
      console.table(data);
    })
  );

const conversations = program
  .command("conversations")
  .description("Manage conversations");

conversations
  .command("list")
  .description("List conversations")
  .action(async () => {
    const state = new State();
    await state.init();

    // TODO(spolu)
  });

conversations
  .command("post <ref> <assistant>")
  .description("Post a new message to a conversation")
  .action(async (ref: string, assistant: string) => {
    const state = new State();
    await state.init();

    if (ref !== "new") {
      throw new Error("<ref> only supports value 'new`");
    }

    let candidate:
      | {
          assistantId: string;
          assistantName: string;
          distance: number;
        }
      | undefined = undefined;
    for (const a of state.agents) {
      const distance =
        1 - jaroWinkler(assistant.toLowerCase(), a.name.toLowerCase());
      if (candidate === undefined || candidate.distance > distance) {
        candidate = {
          assistantId: a.sId,
          assistantName: a.name,
          distance: distance,
        };
      }
    }
    if (!candidate) {
      throw new Error(`Now match for assistant "${assistant}"`);
    }

    const content = await readStdin();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const res = await state.dustAPI().createConversation({
      title: null,
      visibility: "workspace",
      message: {
        content,
        mentions: [{ configurationId: candidate.assistantId }],
        context: {
          timezone,
          username: "overriden",
          fullName: null,
          email: null,
          profilePictureUrl: null,
          origin: null,
        },
      },
      contentFragment: undefined,
    });

    if (res.isErr()) {
      throw new Error(`Failed to create conversation: ${res.error.message}`);
    }

    const agentMessage = res.value.conversation.content.at(-1);
    if (!agentMessage) {
      throw new Error(`No agent message received`);
    }

    const streamRes = await state.dustAPI().streamAgentMessageEvents({
      conversation: res.value.conversation,
      message: agentMessage[0] as AgentMessageType,
    });

    if (streamRes.isErr()) {
      throw new Error(
        `Failed to stream agent message: ${streamRes.error.message}`
      );
    }

    for await (const event of streamRes.value.eventStream) {
      switch (event.type) {
        case "user_message_error": {
          throw new Error(
            `User message error: code: ${event.error.code} message: ${event.error.message}`
          );
        }
        case "agent_error": {
          throw new Error(
            `Agent message error: code: ${event.error.code} message: ${event.error.message}`
          );
        }
        case "error": {
          throw new Error(
            `Error: code: ${event.content.code} message: ${event.content.message}`
          );
        }

        case "agent_action_success": {
          break;
        }

        case "generation_tokens": {
          if (event.classification !== "tokens") {
            continue;
          }

          process.stdout.write(event.text);
          break;
        }

        case "agent_message_success": {
          break;
        }

        default:
          assertNever(event);
      }
    }

    console.log("\n");
  });

async function main() {
  await program.parseAsync(process.argv);
}

main()
  .then(() => {
    console.info("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });
