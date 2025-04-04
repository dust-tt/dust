import fs from "fs";
import path from "path";
import peg from "pegjs";

import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AppType, SpecificationType } from "@app/types";
import type { RunConfig, RunType } from "@app/types";
import { CoreAPI } from "@app/types";

import { recomputeIndents, restoreTripleBackticks } from "../specification";

export const cleanSpecificationFromCore = (
  specification: SpecificationType
) => {
  for (const block of specification) {
    // we clear out the config for input blocks because the dataset might
    // have changed or might not exist anymore
    if (block.type === "input") {
      block.config = {};
    }

    // we have to remove the hash and ID of the dataset in data blocks
    // to prevent the app from becoming un-runable
    if (block.type === "data") {
      delete block.spec.dataset_id;
      delete block.spec.hash;
    }
  }
};

export async function getSpecification(
  app: AppType,
  specificationHash: string
) {
  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

  const s = await coreAPI.getSpecification({
    projectId: app.dustAPIProjectId,
    specificationHash,
  });

  if (s.isErr()) {
    return null;
  }
  // TODO(spolu): check type compatibility at run time.
  const libDir = path.join(process.cwd(), "lib");
  const dustPegJs = fs.readFileSync(libDir + "/dust.pegjs", "utf8");
  const specParser = peg.generate(dustPegJs);

  const spec = specParser.parse(
    s.value.specification.data
  ) as SpecificationType;

  return spec;
}

export async function getRun(
  auth: Authenticator,
  app: AppType,
  runId: string
): Promise<{
  spec: SpecificationType;
  config: RunConfig;
  run: RunType;
} | null> {
  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const r = await coreAPI.getRunStatus({
    projectId: app.dustAPIProjectId,
    runId: runId as string,
  });
  if (r.isErr()) {
    return null;
  }
  const run = r.value.run;
  const config = run.config;

  // Retrieve specification and parse it.
  const specHash = run.app_hash;

  let spec = await getSpecification(app, specHash as string);

  if (!spec) {
    return null;
  }

  for (let i = 0; i < spec.length; i++) {
    if (spec[i].name in config.blocks) {
      spec[i].config = { ...config.blocks[spec[i].name] };
      delete spec[i].config.type;
      // We remove the dataset from the config so that INPUT block do not refer to a dataset in
      // the context of a run display.
      if (spec[i].type === "input") {
        delete spec[i].config.dataset;
      }
      if (spec[i].type === "llm") {
        if (spec[i].spec.stop) {
          spec[i].spec.stop = spec[i].spec.stop.split("\n");
        }
        if (spec[i].spec.few_shot_preprompt) {
          spec[i].spec.few_shot_preprompt = restoreTripleBackticks(
            spec[i].spec.few_shot_preprompt
          );
        }
        if (spec[i].spec.few_shot_prompt) {
          spec[i].spec.few_shot_prompt = restoreTripleBackticks(
            spec[i].spec.few_shot_prompt
          );
        }
        if (spec[i].spec.prompt) {
          spec[i].spec.prompt = restoreTripleBackticks(spec[i].spec.prompt);
        }
      }
      if (spec[i].type === "chat") {
        if (spec[i].spec.stop) {
          spec[i].spec.stop = spec[i].spec.stop.split("\n");
        }
        if (spec[i].spec.instructions) {
          spec[i].spec.instructions = restoreTripleBackticks(
            spec[i].spec.instructions
          );
        }
        if (spec[i].spec.messages_code) {
          spec[i].spec.messages_code = restoreTripleBackticks(
            spec[i].spec.messages_code
          );
        }
        if (spec[i].spec.functions_code) {
          spec[i].spec.functions_code = restoreTripleBackticks(
            spec[i].spec.functions_code
          );
        }
      }
      if (spec[i].type === "while") {
        if (spec[i].spec.condition_code) {
          spec[i].spec.condition_code = restoreTripleBackticks(
            spec[i].spec.condition_code
          );
        }
      }
      if (spec[i].type === "data_source") {
        if (spec[i].spec.query) {
          spec[i].spec.query = restoreTripleBackticks(spec[i].spec.query);
        }
        if (spec[i].spec.full_text) {
          spec[i].spec.full_text =
            spec[i].spec.full_text === "true" ? true : false;
        }
      }
      if (spec[i].type === "curl") {
        if (spec[i].spec.url && spec[i].spec.url.includes("://")) {
          spec[i].spec.scheme = spec[i].spec.url.split("://")[0];
          spec[i].spec.url = spec[i].spec.url.split("://")[1];
        }
      }
    } else {
      spec[i].config = {};
    }
  }
  spec = recomputeIndents(spec);

  return {
    spec,
    config,
    run: {
      run_id: run.run_id,
      created: run.created,
      run_type: run.run_type,
      app_hash: run.app_hash,
      config: run.config,
      status: run.status,
      traces: [],
    },
  };
}
