import * as fs from "fs";
import seedrandom from "seedrandom";

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

const LEVELS = [1, 2, 3, 4, 5];

const MATH_DIR = "/home/spolu/stash/evals/MATH";

// type problem

type Problem = {
  problem: string;
  level: string | number;
  type: string;
  name: string;
  solution: string;
  reasoning?: string[];
  answer?: string;
};

async function processSplit(split: "train" | "test", size_per_level: number) {
  const rng = seedrandom("MATH_DATASET");

  const splitDir = MATH_DIR + "/" + split;
  const files: {
    [type: string]: {
      type: string;
      number: string;
      path: string;
    }[];
  } = {};
  for (const t of TYPES) {
    const categoryDir = splitDir + "/" + t;
    const ff = await fs.promises.readdir(categoryDir);
    for (const file of ff) {
      if (!files[t]) {
        files[t] = [];
      }
      files[t].push({
        type: t,
        number: file.slice(0, file.length - 5),
        path: categoryDir + "/" + file,
      });
    }
  }

  for (const t of TYPES) {
    files[t] = files[t].sort(() => rng() - 0.5);
  }

  const problems: { [type: string]: { [level: number]: Problem[] } } = {};

  for (const t of TYPES) {
    problems[t] = [];
    for (const file of files[t]) {
      const f = await fs.promises.open(file.path, "r");
      const data = await f.readFile({ encoding: "utf-8" });
      await f.close();
      const problem: Problem = JSON.parse(data);
      problem.level = parseInt((problem.level as string).slice(6));
      problem.name = file.type + "-" + "l" + problem.level + "-" + file.number;
      problem.type = file.type;
      if (!problems[problem.type]) {
        problems[problem.type] = [];
      }
      if (!problems[problem.type][problem.level]) {
        problems[problem.type][problem.level] = [];
      }
      problems[problem.type][problem.level].push(problem);
    }
  }

  for (const t of TYPES) {
    for (const l of LEVELS) {
      problems[t][l] = problems[t][l].slice(0, size_per_level);
    }
  }

  // flatten problems
  let flat: Problem[] = [];
  for (const t of TYPES) {
    for (const l of LEVELS) {
      flat = flat.concat(problems[t][l]);
    }
  }

  const chunkSize = 8;
  const chunks = [];
  for (let i = 0; i < flat.length; i += chunkSize) {
    chunks.push(flat.slice(i, i + chunkSize));
  }

  const out: Problem[] = [];

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
                    // openai_organization_id: "org-8qQhvDGNheVbbZ4iNRQLfu11",
                    provider_id: "openai",
                    model_id: "gpt-4-1106-preview",
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
          console.log(data);
          const v = data.run.traces[2][1][0][0].value;
          if (v) {
            p.answer = v["answer"];
            p.reasoning = v["reasoning"];
            out.push(p);
          }
        })();
      })
    );
  }

  return out;
}

const main = async () => {
  // const train = await processSplit("train", 8);
  // const fTrain = await fs.promises.open("train.jsonl", "w");
  // for (const p of train) {
  //   console.log(p);
  //   await fTrain.write(JSON.stringify(p) + "\n");
  // }

  const test = await processSplit("test", 8);
  const fTest = await fs.promises.open("test.jsonl", "w");
  for (const p of test) {
    console.log(p);
    await fTest.write(JSON.stringify(p) + "\n");
  }
};

main()
  .then(() => console.log("Done"))
  .catch(console.error);
