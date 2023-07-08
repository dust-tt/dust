/**
 *  Run an eval of our chat app with a test set of questions
 *  See: https://www.notion.so/dust-tt/Design-Doc-Chat-Eval-0b849d4c66564f1e9c0c31d537c96f78
 */

import * as fs from "fs";
import * as path from "path";

import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import { Authenticator, getOrCreateSystemApiKey } from "@app/lib/auth";
import { Workspace } from "@app/lib/models";
import { Ok } from "@app/lib/result";
import { RunType } from "@app/types/run";
import { WorkspaceType } from "@app/types/user";
import { newChat } from "@app/lib/api/chat";

type ChatEvalInput = {
  question: string;
  rules: string[];
  answer: string;
};
async function main() {
  /* Auth */
  const workspacesId = process.env.LOCALHOST_WORKSPACE_ID as string;
  const auth = await Authenticator.internalBuilderForWorkspace(workspacesId);
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Invalid workspace");
  }

  async function computeChatAnswer(input: ChatEvalInput) {
    /* Create a system API key 
  const keyRes = await getOrCreateSystemApiKey(owner);
  if (keyRes.isErr()) {
    throw new Error(`Failed to get system API key: ${keyRes.error}`);
  }*/
    /* Call the chat lib */
    const chatRes = await newChat(auth, {
      userMessage: input.question,
      dataSources: null,
      filter: null,
      timeZone: "Europe/Paris",
    });
    for await (const event of chatRes) {
      if (
        event.type === "chat_message_create" &&
        event.message.role === "assistant"
      ) {
        console.log(event.message.message);
        return event.message.message;
      }
    }
    return "There was an error. Please check with the team";
  }

  /* Load the JSON test data from data/chat-eval-inputs.jsonl's first 2 elements*/
  const evalData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/chat-eval-inputs.json"), "utf8")
  ).slice(0, 2) as ChatEvalInput[];

  /* Compute Chat's answers for each input */
  const dataWithAnswers = await Promise.all(
    evalData.map(async (input: ChatEvalInput) => {
      return {
        question: input.question,
        rules: input.rules,
        answer: await computeChatAnswer(input),
      };
    })
  );

  /* run the chat eval app on dataWithAnswers */
  const config = cloneBaseConfig(
    DustProdActionRegistry["chat-message-e2e-eval"].config
  );
  const evalResult = (await runAction(
    auth,
    "chat-message-e2e-eval",
    config,
    dataWithAnswers
  )) as Ok<RunType>;
  if (!evalResult.value.results) {
    throw new Error("No results found");
  }

  /* Print the results */
  for (const result of evalResult.value.results) {
    console.log(result[0].value);
  }
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
