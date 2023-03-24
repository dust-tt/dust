import { XP1User } from "@app/lib/models";

export default async function handler(req, res) {
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
