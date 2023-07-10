/**
 * Run an eval of our chat app with a test set of questions See:
 * https://www.notion.so/dust-tt/Design-Doc-Chat-Eval-0b849d4c66564f1e9c0c31d537c96f78
 *
 *
 * By default, runs on all questions. Use `--n NUMBER_OF_QUESTIONS` to change that (e.g. smaller evals)
 *
 * Usage: from front directory
 * `./admin/eval.sh [--verbose] [--n NUMBER_OF_QUESTIONS]`
 *
 *
 */

import * as fs from "fs";
import * as path from "path";

import {
  cloneBaseConfig,
  DustProdActionRegistry,
} from "@app/lib/actions/registry";
import { runAction } from "@app/lib/actions/server";
import { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/lib/result";
import { RunType } from "@app/types/run";
import { newChat } from "@app/lib/api/chat";

type ChatEvalInput = {
  question: string;
  rules: string[];
  answer: string;
};

async function chatEval(numberOfQuestions: number | undefined = undefined) {
  /* Auth */
  const workspacesId = process.env.LOCALHOST_WORKSPACE_ID as string;
  const auth = await Authenticator.internalBuilderForWorkspace(workspacesId);
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Invalid workspace");
  }

  async function computeChatAnswer(input: ChatEvalInput) {
    /* Call the chat lib */
    const chatRes = await newChat(
      auth,
      {
        userMessage: input.question,
        dataSources: null,
        filter: null,
        timeZone: "Europe/Paris",
      },
      false
    );
    let answer = undefined;
    for await (const event of chatRes) {
      if (
        event.type === "chat_message_create" &&
        event.message.role === "assistant"
      ) {
        answer = event.message.message;
      } else if (event.type === "chat_session_create") {
        console.log(event.session);
      }
    }

    return answer ? answer : "There was an error. Please check with the team";
  }

  /* Load the JSON test data from data/chat-eval-inputs.jsonl */
  let evalData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/chat-eval-inputs.json"), "utf8")
  );
  if (numberOfQuestions)
    evalData = evalData.slice(0, numberOfQuestions) as ChatEvalInput[];

  /* Compute Chat's answers for each input */
  const dataWithAnswers = await Promise.all(
    evalData.map(async (input: ChatEvalInput) => {
      console.log(`Computing answer for ${input.question}`);
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

  /* Format the results */
  return evalResult.value.results.map((r, i) => {
    return {
      question: dataWithAnswers[i].question,
      answer: dataWithAnswers[i].answer,
      evalResult: (r[0].value as { result: object; rule: string }[]).map(
        (v) => {
          return {
            ...v.result,
            rule: v.rule,
          };
        }
      ),
    };
  });
}

async function main() {
  const numberOfQuestions = process.argv.includes("--n")
    ? parseInt(process.argv[process.argv.indexOf("--n") + 1])
    : undefined;

  let chatEvalResults = await chatEval(numberOfQuestions);
  /* Print the results */
  for (const result of chatEvalResults) {
    console.log(result);
  }
}
main().catch((err) => {
  console.log(err);
  process.exit(1);
});
