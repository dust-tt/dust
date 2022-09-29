import { User, App } from "../../lib/models";

export default async function handler(req, res) {
  switch (req.method) {
    case "GET":
      User.sync({ alter: true });
      App.sync({ alter: true });
      console.log("OK");
      res.status(200).json({ ok: true });
      break;

    default:
      res.status(405).end();
      break;
  }
}
