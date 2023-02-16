import { XP1User } from "../../../../lib/models";

const { XP1_STRIPE_API_KEY } = process.env;

export default async function handler(req, res) {
  const stripe = require("stripe")(XP1_STRIPE_API_KEY);

  if (req.method !== "POST") {
    return res.status(405).json({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  if (!req.body || !(typeof req.body.secret === "string")) {
    return res.status(400).json({
      error: {
        type: "invalid_request_error",
        message: "Invalid request body, `secret` (string) is required.",
      },
    });
  }

  let user = await XP1User.findOne({
    where: {
      secret: req.body.secret || "none",
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

  const usageRecordSummaries =
    await stripe.subscriptionItems.listUsageRecordSummaries(
      user.stripeSubscriptionItem,
      { limit: 1 }
    );

  res.status(200).json({
    usage: {
      total: usageRecordSummaries.data[0].total_usage,
    },
  });
}
