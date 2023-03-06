import { XP1User } from "../../../lib/models";
import { new_id } from "../../../lib/utils";
import { sendActivationKey } from "../../../lib/sendgrid";

const {} = process.env;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }
  console.log(req.body);
  if (
    !req.body ||
    !(typeof req.body.name == "string") ||
    !(typeof req.body.email == "string")
  ) {
    res.status(400).end();
    return;
  }

  console.log(`USER_CREATION`, {
    name: req.body.name,
    email: req.body.email,
  });

  let user = await XP1User.findOne({
    where: {
      email: req.body.email,
    },
  });
  if (!user) {
    let secret = `sk-${new_id().slice(0, 32)}`;
    user = await XP1User.create({
      secret,
      email: customer.email || "",
      name: customer.name || "",
    });
  }

  await sendActivationKey(user);

  res.redirect(`/xp1/activate/success`);
}
