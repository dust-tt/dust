import { User, App, Dataset, Provider } from "../../lib/models";

export default async function handler(req, res) {
  switch (req.method) {
    case "GET":

      await User.sync({ alter: true });
      await App.sync({ alter: true });
      await Dataset.sync({ alter: true });
      await Provider.sync({ alter: true });

      res.status(200).json({ ok: true });
      break;

    default:
      res.status(405).end();
      break;
  }
}
