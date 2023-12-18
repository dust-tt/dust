import * as fs from "fs";

const main = async () => {
  const problems: {
    [key: string]: { problem: string; rank: number; solutions: string[] };
  } = {};

  const fileRank = await fs.promises.readFile("24_rank.data", "utf8");

  let pos = 0;
  let rank = 0;
  fileRank.split("\n").forEach((line) => {
    if (pos % 8 === 1) {
      rank = parseInt(line.trim());
    }
    if (pos % 8 === 2) {
      const problem = line.trim();
      problems[problem] = { problem, rank, solutions: [] };
      // console.log(problem, rank);
    }
    pos += 1;
  });

  const fileSols = await fs.promises.readFile("24_solutions.data", "utf8");

  let problem: string | null = null;
  let solutions: string[] = [];

  fileSols.split("\n").forEach((line) => {
    if (line === "BEGIN") {
      problem = null;
      solutions = [];
      return;
    }

    if (line === "END") {
      if (problem && solutions.length > 0 && problems[problem]) {
        problems[problem].solutions = solutions;
        // console.log(problem, problems[problem].rank, solutions);
        return;
      } else {
        console.log("SKIP", problem, solutions);
        return;
      }
    }

    if (problem === null) {
      problem = line.trim();
      return;
    } else {
      solutions.push(line.trim());
    }
  });

  // write a JSONL file from problems
  const file = await fs.promises.open("24.jsonl", "w");
  for (const problem in problems) {
    await file.write(JSON.stringify(problems[problem]) + "\n");
  }
};

main()
  .then(() => console.log("Done"))
  .catch(console.error);
