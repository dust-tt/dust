import { XP1User } from "@app/lib/models";
import { sendActivationKey } from "@app/lib/sendgrid";
import { new_id } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { withLogging } from "@app/logger/withlogging";

const {} = process.env;

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }
  if (
    !req.body ||
    !(typeof req.body.name == "string") ||
    !(typeof req.body.email == "string")
  ) {
    res.status(400).end();
    return;
  }

  logger.info(
    { name: req.body.name, email: req.body.email },
    "XP1 user creation"
  );

  let user = await XP1User.findOne({
    where: {
      email: req.body.email,
    },
  });
  if (!user) {
    let secret = `sk-${new_id().slice(0, 32)}`;
    user = await XP1User.create({
      secret,
      email: req.body.email,
      name: req.body.name,
    });
  }

  await sendActivationKey(user);

  res.redirect(`/xp1/activate/success`);
}

export default withLogging(handler);
