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
import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models";
import { Ok } from "@app/lib/result";
import { RunType } from "@app/types/run";
import { WorkspaceType } from "@app/types/user";

type ChatEvalInput = {
  question: string;
  rules: string[];
  answer: string;
};
async function computeChatAnswer(input: object) {
  return "I have no clue.";
}

async function main() {
  /* Get the localhost owner */
  const { LOCALHOST_WORKSPACE_ID } = process.env;
  const workspace = await Workspace.findOne({
    where: { sId: LOCALHOST_WORKSPACE_ID },
  });
  const auth = new Authenticator(workspace, null, "builder");

  /* Load the JSON test data from data/chat-eval-inputs.jsonl */

  const evalData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/chat-eval-inputs.json"), "utf8")
  );
  const dataWithAnswers = await Promise.all(
    evalData.map(async (input: ChatEvalInput) => {
      return {
        question: input.question,
        rules: input.rules,
        answer: await computeChatAnswer(input),
      };
    })
  );
  const config = cloneBaseConfig(
    DustProdActionRegistry["chat-message-e2e-eval"].config
  );
  /* run the chat eval app on dataWithAnswers */
  const evalResult = (await runAction(
    auth,
    "chat-message-e2e-eval",
    config,
    dataWithAnswers
  )) as Ok<RunType>;
  if (!evalResult.value.results) {
    throw new Error("No results found");
  }
  for (const result of evalResult.value.results) {
    console.log(result[0].value);
  }
}
main().catch((err) => {
  console.log(err);
  process.exit(1);
});
