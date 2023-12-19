import parseArgs from "minimist";

import {
  Algorithm,
  AlgorithmType,
  ValidAlgorithmTypes,
} from "@app/lib/algorithms";
import { CoT } from "@app/lib/algorithms/CoT";
import { Dataset, DatasetType, ValidDatasetTypes } from "@app/lib/datasets";
import { Game24 } from "@app/lib/datasets/game24";
import { MATH } from "@app/lib/datasets/MATH";
import { Model, ProviderType, ValidProviderTypes } from "@app/lib/models";
import { MistralModel, MistralModelType } from "@app/lib/models/mistral";
import { OpenAIModel, OpenAIModelType } from "@app/lib/models/openai";

import { CoTConsensus } from "./lib/algorithms/CoTConsensus";

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 4) {
    console.log("Usage: `evals <provider> <model> <algo> <dataset>`");
    return;
  }

  const [providerArg, model, algorithmArg, datasetArg] = argv._;

  const provider = providerArg as ProviderType;
  const algorithm = algorithmArg as AlgorithmType;
  const dataset = datasetArg as DatasetType;

  if (!ValidDatasetTypes.includes(dataset)) {
    console.log("Valid datasets: ", ValidDatasetTypes);
    return;
  }

  if (!ValidAlgorithmTypes.includes(algorithm)) {
    console.log("Valid algorithms: ", ValidAlgorithmTypes);
    return;
  }

  if (!ValidProviderTypes.includes(provider)) {
    console.log("Valid providers: ", ValidProviderTypes);
    return;
  }

  let m: Model | null = null;
  switch (provider) {
    case "openai":
      m = new OpenAIModel(model as OpenAIModelType);
      break;
    case "mistral":
      m = new MistralModel(model as MistralModelType);
      break;
    default:
      ((x: never) => x)(provider);
  }
  if (!m) {
    throw new Error("Model not found");
  }

  let d: Dataset | null = null;
  switch (dataset) {
    case "Game24":
      d = new Game24();
      break;
    case "MATH":
      d = new MATH();
      break;
    default:
      ((x: never) => x)(dataset);
  }
  if (!d) {
    throw new Error("Dataset not found");
  }

  await d.load();

  let a: Algorithm | null = null;
  switch (algorithm) {
    case "CoT":
      a = new CoT(d, m);
      break;
    case "CoT-consensus":
      a = new CoTConsensus(d, m);
      break;
    default:
      ((x: never) => x)(algorithm);
  }
  if (!a) {
    throw new Error("Algorithm not found");
  }

  await a.run({
    tests: d.tests({ count: parseInt(process.env.TEST_COUNT || "8") }),
    concurrency: parseInt(process.env.RUN_CONCURRENCY || "4"),
    debug: process.env.DEBUG === "true",
  });

  console.log(
    `Finished run: algorithm=${algorithm} dataset=${dataset} provider=${provider} model=${model}`
  );
  a.computeResults();
  a.finalStats();
}

main()
  .then(() => console.log("Done"))
  .catch(console.error);
