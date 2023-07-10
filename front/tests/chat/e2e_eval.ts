/**
 * Run an eval of our chat app with a test set of questions See:
 * https://www.notion.so/dust-tt/Design-Doc-Chat-Eval-0b849d4c66564f1e9c0c31d537c96f78
 *
 *
 * By default, runs on all questions. Use `--n NUMBER_OF_QUESTIONS` to change that (e.g. smaller evals)
 * Use `--verbose` to print the successes as well as the failures
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
import { newChat } from "@app/lib/api/chat";
import { Authenticator } from "@app/lib/auth";
import { Ok } from "@app/lib/result";
import { RunType } from "@app/types/run";

type ChatEvalInputType = {
  question: string;
  rules: string[];
  answer: string;
};

type EvalResultType = {
  rule: string;
  rule_respected: string;
  explanation?: string;
};

async function chatEval(
  numberOfQuestions: number | undefined,
  verbose = false
) {
  /* Auth */
  const workspacesId = process.env.LOCALHOST_WORKSPACE_ID as string;
  const auth = await Authenticator.internalBuilderForWorkspace(workspacesId);
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Invalid workspace");
  }

  async function computeChatAnswer(input: ChatEvalInputType) {
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
        if (verbose) console.log(event.session);
      }
    }

    return answer ? answer : "There was an error. Please check with the team";
  }

  /* Load the JSON test data from data/chat-eval-inputs.jsonl */
  let evalData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data/chat-eval-inputs.json"), "utf8")
  );
  if (numberOfQuestions)
    evalData = evalData.slice(0, numberOfQuestions) as ChatEvalInputType[];

  /* Compute Chat's answers for each input */
  const dataWithAnswers = await Promise.all(
    evalData.map(async (input: ChatEvalInputType) => {
      if (verbose) console.log(`Computing answer for ${input.question}`);
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
          } as EvalResultType;
        }
      ),
    };
  });
}

async function main() {
  const numberOfQuestions = process.argv.includes("--n")
    ? parseInt(process.argv[process.argv.indexOf("--n") + 1])
    : undefined;
  const verbose = process.argv.includes("--verbose");
  const chatEvalResults = await chatEval(numberOfQuestions, verbose);

  /* count the number of successes */
  const successfulQuestion = (r: EvalResultType[]) => {
    return r.reduce((acc, r) => {
      return acc && r.rule_respected === "YES";
    }, true);
  };

  const successes = chatEvalResults.reduce((acc, r) => {
    /** return 1 if for all elts of evalResult, rule_respected is 'YES'
     * 0 otherwise */
    return acc + (successfulQuestion(r.evalResult) ? 1 : 0);
  }, 0);
  console.log(
    `FAIL: ${
      chatEvalResults.length - successes
    } and PASS: ${successes} out of ${chatEvalResults.length}`
  );
  /* Print the failures  (and the successes if verbose) */
  if (!verbose) console.log("FAILURES:");
  for (const result of chatEvalResults) {
    if (!successfulQuestion(result.evalResult) || verbose) {
      console.log("Question: " + result.question);
      console.log("Answer: " + result.answer);
      console.log(
        result.evalResult.filter((r) => r.rule_respected !== "YES" || verbose)
      );
      console.log("\n----");
    }
  }
  console.log(
    `FAIL: ${
      chatEvalResults.length - successes
    } and PASS: ${successes} out of ${chatEvalResults.length}`
  );
}
main().catch((err) => {
  console.log(err);
  process.exit(1);
});
