import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../../auth/[...nextauth]";
import { User, App } from "../../../../../../../lib/models";
import { recomputeIndents } from "../../../../../../../lib/specification";
import peg from "pegjs";
import fs from "fs";
import path from "path";

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

  const readOnly = !(session && session.github.id.toString() === user.githubId);

  let [app] = await Promise.all([
    App.findOne({
      where: readOnly
        ? {
            userId: user.id,
            sId: req.query.sId,
            visibility: "public",
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
