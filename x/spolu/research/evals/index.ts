import parseArgs from "minimist";
import { DatasetType } from "./lib/datasets";
import { AlgorithmType } from "./lib/algorithms";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 1) {
    console.log(
      "Expects `algorithm` and `dataset` as first two argument, eg: `npx tsx index.js CoT MATH`"
    );
    console.log("Supported `algorithm` values: `CoT`, `CoT-consensus`, `ToT`");
    console.log("Supported `dataset` values: `MATH`, `Krypto4`");
    return;
  }

  const [a, d] = argv._;

  if (!["MATH", "Krypto4"].includes(d)) {
    throw new Error(`Unsupported dataset: ${d}`);
  }
  const dataset: DatasetType = d as DatasetType;

  if (!["CoT", "CoT-consensus", "ToT"].includes(a)) {
    throw new Error(`Unsupported algorithm: ${a}`);
  }
  const algorithm: AlgorithmType = a as AlgorithmType;

  console.log(`Running: algorithm=${algorithm} dataset=${dataset}`);
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });
