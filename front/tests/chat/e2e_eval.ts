/**
 * Run an eval of our chat app with a test set of questions See:
 * https://www.notion.so/dust-tt/Design-Doc-Chat-Eval-0b849d4c66564f1e9c0c31d537c96f78
 *
 * Use `--verbose` to print the successes as well as the failures Usage: from
 * front directory `./admin/eval.sh [--verbose] [--n NUMBER_OF_QUESTIONS]`
 *
 * By default, runs on all questions. Use `--n NUMBER_OF_QUESTIONS` to change
 * that (e.g. smaller evals). This is to allow fast testing of the eval code
 *
 * As the eval code may need to change over time and has been written with the
 * intention of being reused for other kinds of chat evals, the ability to not
 * run it on all questions is useful, especially since the questions test set is
 * likely to become sizeable
 *
 * The chat sessions created by the eval are not saved in the database, to avoid
 * flooding the database with test data that can be considered noisy.
 *
 */

import { Storage } from "@google-cloud/storage";

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
  time?: string;
};

type EvalResultType = {
  rule: string;
  rule_respected: "YES" | "NO" | "UNCLEAR";
  explanation?: string;
};

async function chatEval(
  numberOfQuestions: number | undefined,
  verbose = false
) {
  /* Auth */
  const workspaceId = process.env.LOCALHOST_WORKSPACE_ID as string;
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Invalid workspace");
  }

  async function getChatEvalInput(): Promise<ChatEvalInputType[]> {
    /* Load the JSON test data from our GCS bucket */
    const storage = new Storage({ keyFilename: process.env.SERVICE_ACCOUNT });
    const bucket = storage.bucket("dust-test-data");
    const file = bucket.file("chat-eval-inputs.json");
    const fileContents = await file.download();
    const evalData = JSON.parse(fileContents.toString());
    return evalData as ChatEvalInputType[];
  }

  async function computeChatAnswer(input: ChatEvalInputType) {
    /* Prepare time and date for chatting */
    const date = input.time ? new Date(input.time) : new Date();
    const timestamp = date.getTime();
    const dateStr = date.toISOString().split("T")[0];

    /* Call the chat lib */
    const chatRes = await newChat(
      auth,
      {
        userMessage: input.question,
        dataSources: null,
        filter: { timestamp: { lt: timestamp } },
        timeZone: "Europe/Paris",
        context: { date_today: dateStr },
      },
      false // the chat session is not saved
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
  let evalData = await getChatEvalInput();
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
  const isSuccessfulQuestion = (r: EvalResultType[]) => {
    return r.reduce((acc, r) => {
      return acc && r.rule_respected === "YES";
    }, true);
  };

  const totalSuccesses = chatEvalResults.reduce((acc, r) => {
    /** return 1 if for all elts of evalResult, rule_respected is 'YES'
     * 0 otherwise */
    return acc + (isSuccessfulQuestion(r.evalResult) ? 1 : 0);
  }, 0);
  console.log(
    `\nFAIL: ${
      chatEvalResults.length - totalSuccesses
    } and PASS: ${totalSuccesses} out of ${chatEvalResults.length}\n`
  );
  /* Print the failures  (and the successes if verbose) */
  if (!verbose) console.log("FAILURES:\n");
  for (const result of chatEvalResults) {
    if (!isSuccessfulQuestion(result.evalResult) || verbose) {
      console.log("Question: " + result.question);
      console.log("Answer: " + result.answer);
      console.log(
        result.evalResult.filter((r) => r.rule_respected !== "YES" || verbose)
      );
      console.log("\n----");
    }
  }
  console.log(
    `\nFAIL: ${
      chatEvalResults.length - totalSuccesses
    } and PASS: ${totalSuccesses} out of ${chatEvalResults.length}`
  );
}
main().catch((err) => {
  console.log(err);
  process.exit(1);
});
