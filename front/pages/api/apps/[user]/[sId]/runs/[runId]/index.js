import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../auth/[...nextauth]";
import { User, App } from "../../../../../../../lib/models";
import {
  recomputeIndents,
  restoreTripleBackticks,
} from "../../../../../../../lib/specification";
import peg from "pegjs";
import fs from "fs";
import path from "path";
import { Op } from "sequelize";

const { DUST_API } = process.env;

const libDir = path.join(process.cwd(), "lib");
const dustPegJs = fs.readFileSync(libDir + "/dust.pegjs", "utf8");
const specParser = peg.generate(dustPegJs);

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  let user = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!user) {
    res.status(404).end();
    return;
  }

  const readOnly = !(
    session && session.provider.id.toString() === user.githubId
  );

  let [app] = await Promise.all([
    App.findOne({
      where: readOnly
        ? {
            userId: user.id,
            sId: req.query.sId,
            visibility: {
              [Op.or]: ["public", "unlisted"],
            },
          }
        : {
            userId: user.id,
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
      // Retrieve run and config.
      const runRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/runs/${runId}/status`,
        {
          method: "GET",
        }
      );

      if (!runRes.ok) {
        res.status(500).end();
        break;
      }

      const r = await runRes.json();
      const run = r.response.run;
      const config = run.config;

      // Retrieve specification and parse it.
      const specHash = run.app_hash;
      const specRes = await fetch(
        `${DUST_API}/projects/${app.dustAPIProjectId}/specifications/${specHash}`,
        {
          method: "GET",
        }
      );

      if (!specRes.ok) {
        res.status(500).end();
        break;
      }

      const s = await specRes.json();

      let spec = specParser.parse(s.response.specification.data);
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

      // console.log("SPEC", spec);
      // console.log("CONFIG", config);
      // console.log("RUN", run);

      res.status(200).json({ app, spec, config, run });
      break;

    default:
      res.status(405).end();
      break;
  }
}
