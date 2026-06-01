import { launchInvitationRemindersWorkflow } from "@app/temporal/invitations/client";
import parseArgs from "minimist";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));
  const [command] = argv._;

  switch (command) {
    case "start":
      await launchInvitationRemindersWorkflow();
      return;
    default:
      console.error("\x1b[31m%s\x1b[0m", `Error: Unknown command`);
      return;
  }
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });
