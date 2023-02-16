import { XP1User } from "../../../../lib/models";

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
    stripeSubscription: user.subscription,
    stripeSubscriptionStatus: user.stripeSubscriptionStatus,
    secret: user.secret,
  });
}
