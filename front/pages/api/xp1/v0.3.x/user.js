import { XP1User } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";

async function handler(req, res) {
  if (typeof req.body.secret !== "string" || !req.body.secret) {
    return res.status(404).json({
      error: {
        code: "user_not_found",
        message: "User not found",
      },
    });
  }

  let user = await XP1User.findOne({
    where: {
      secret: req.body.secret,
    },
  });

  if (!user) {
    return res.status(404).json({
      error: {
        code: "user_not_found",
        message: "User not found",
      },
    });
  }

  return res.status(200).json({
    email: user.email,
    name: user.name,
    secret: user.secret,
  });
}

export default withLogging(handler);
