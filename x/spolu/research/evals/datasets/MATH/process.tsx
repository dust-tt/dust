import * as fs from "fs";
import seedrandom = require("seedrandom");

const { DUST_API_KEY } = process.env;

const TYPES = [
  "algebra",
  "counting_and_probability",
  "geometry",
  "intermediate_algebra",
  "number_theory",
  "prealgebra",
  "precalculus",
];

const MATH_DIR = "/home/spolu/stash/evals/MATH";

// type problem

type Problem = {
  problem: string;
  level: string;
  type: string;
  solution: string;
  reasoning?: string[];
  answer?: string;
};

async function processSplit(split: "train" | "test") {
  let rng = seedrandom("MATH");

  const splitDir = MATH_DIR + "/" + split;
  let files: {
    type: string;
    path: string;
  }[] = [];
  for (const t of TYPES) {
    const categoryDir = splitDir + "/" + t;
    const ff = await fs.promises.readdir(categoryDir);
    for (const file of ff) {
      files.push({
        type: t,
        path: categoryDir + "/" + file,
      });
    }
  }

  files = files.sort(() => rng() - 0.5);
  files = files.slice(0, 264);

  let problems: Problem[] = [];

  for (const file of files) {
    const f = await fs.promises.open(file.path, "r");
    const data = await f.readFile({ encoding: "utf-8" });
    await f.close();
    const problem: Problem = JSON.parse(data);
    problems.push(problem);
  }

  const chunkSize = 8;
  const chunks = [];
  for (let i = 0; i < problems.length; i += chunkSize) {
    chunks.push(problems.slice(i, i + chunkSize));
  }

  let out: Problem[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((p: Problem) => {
        return (async () => {
          const res = await fetch(
            "https://dust.tt/api/v1/w/3e26b0e764/apps/032e2a47a5/runs",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${DUST_API_KEY}`,
              },
              body: JSON.stringify({
                specification_hash:
                  "9d8f9de03357b19187610d3c3c90b96a9db5dd5f4fd264015a9f2e3e5632a753",
                config: {
                  MODEL: {
                    provider_id: "openai",
                    model_id: "gpt-4",
                    function_call: "submit_reasoning_and_sanitized_answer",
                    use_cache: true,
                  },
                },
                blocking: true,
                inputs: [
                  {
                    input: JSON.stringify(p),
                  },
                ],
              }),
            }
          );

          const data = await res.json();
          const v = data.run.traces[2][1][0][0].value;
          if (v) {
            p.answer = v["answer"];
            p.reasoning = v["reasoning"];
            out.push(p);
          }
        })();
      })
    );
    if (i > 2) {
      break;
    }
  }

  return out;
}

const main = async () => {
  const train = await processSplit("train");
  // const test = await processSplit("train");
  console.log(train);
  console.log(train?.length);
};

main();
