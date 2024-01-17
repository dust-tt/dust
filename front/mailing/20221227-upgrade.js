import sgMail from "@sendgrid/mail";

const { SENDGRID_API_KEY } = process.env;
sgMail.setApiKey(SENDGRID_API_KEY);

export const sendUpgradeEmail = async (user) => {
  const msg = {
    to: user.email,
    from: "spolu@dust.tt",
    subject: "[XP1] Upgrade and Activation Key",
    text: `Thank you for being among the first users of XP1!

XP1 is now available on the Chrome Web Store[0]. To continue using XP1
you will need to upgrade your manually installed version.

Instructions:
- Go to chrome://extensions
- Remove XP1
- Install XP1 from the Chrome Web Store[0]

As a reminder, your activation key is: ${user.secret}

Bonus: the new version renders CSV as tables that can be easily copied
to spreadsheets. Also remember that you can also remap XP1's shortcut
at any time by visiting chrome://extensions/shortcuts.

We are working hard on making XP1 even more powerful! Here's a sneak
peak of what's coming:

- Improved tab selection experience
- Statefulness and history
  - Preserve state when the extension is closed / tab switched
  - Cycle through previous queries with up-arrow
  - Access to previous sessions
- Ability to  run Dust apps from XP1

Have any other ideas? Don't hesitate to respond to this email directly
with any question, feature request, or just to let us know how you
save time with XP1.

Looking forward to hearing from you.

-stan

[0] https://chrome.google.com/webstore/detail/dust-xp1/okgjeakekjeppjocmfaeeeaianominge`,
  };

  await sgMail.send(msg);

  console.log("UPGRADE & ACTIVATION KEY SENT", user.email);
};

// async function main() {
//   let users = await (
//     await XP1User.findAll()
//   ).filter((u) => {
//     return u.id <= 236;
//   });
//
//   users.forEach((u) => {
//     console.log("USER", u.id, u.email);
//   });
//
//   if (LIVE && LIVE === "true") {
//     console.log("SENDING EMAILS");
//     await Promise.all(
//       users.map((u) => {
//         return sendUpgradeEmail(u);
//       })
//     );
//   }
//
//   process.exit(0);
// }
//
// await main();
