import { auth_user } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { App, User } from "@app/lib/models";
import {
  recomputeIndents,
  restoreTripleBackticks,
} from "@app/lib/specification";
import withLogging from "@app/logger/withlogging";
import { AppType, SpecificationType } from "@app/types/app";
import { RunConfig, RunType } from "@app/types/run";
import fs from "fs";
import { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import peg from "pegjs";

const libDir = path.join(process.cwd(), "lib");
const dustPegJs = fs.readFileSync(libDir + "/dust.pegjs", "utf8");
const specParser = peg.generate(dustPegJs);

export type GetRunStateResponseBody = {
  app: AppType;
  spec: SpecificationType;
  config: RunConfig;
  run: RunType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetRunStateResponseBody>
): Promise<void> {
  let [authRes, appUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

  if (!appUser) {
    res.status(404).end();
    return;
  }

  let [app] = await Promise.all([
    App.findOne({
      where: {
        userId: appUser.id,
        sId: req.query.sId,
      },
    }),
  ]);

  if (!app) {
    res.status(404).end();
    return;
  }

  let runId = req.query.runId;

  switch (req.method) {
    case "GET":
      if (!auth.canReadApp(app)) {
        res.status(404).end();
        return;
      }

      const r = await DustAPI.getRunStatus(
        app.dustAPIProjectId,
        runId as string
      );
      if (r.isErr()) {
        res.status(500).end();
        return;
      }
      const run = r.value.run;
      const config = run.config;

      // Retrieve specification and parse it.
      const specHash = run.app_hash;

      const s = await DustAPI.getSpecification(
        app.dustAPIProjectId,
        specHash as string
      );

      if (s.isErr()) {
        res.status(500).end();
        return;
      }

      let spec = specParser.parse(s.value.specification.data);

      for (var i = 0; i < spec.length; i++) {
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
              if (spec[i].spec.messages_code) {
                spec[i].spec.messages_code = restoreTripleBackticks(
                  spec[i].spec.messages_code
                );
              }
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

      res.status(200).json({
        app: {
          uId: app.uId,
          sId: app.sId,
          name: app.name,
          description: app.description,
          visibility: app.visibility,
          savedSpecification: app.savedSpecification,
          savedConfig: app.savedConfig,
          savedRun: app.savedRun,
          dustAPIProjectId: app.dustAPIProjectId,
        },
        spec: spec.map((b: any) => {
          return {
            type: b.type,
            name: b.name,
            spec: b.spec,
            config: b.config,
            indent: b.indent,
          };
        }),
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
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
