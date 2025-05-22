import type { SessionWithUser } from "@app/lib/iam/provider";

// This code runs in SSR, where environment variables are replaced at build time.
// const connectionStrategyClaim = `${process.env.AUTH0_CLAIM_NAMESPACE}connection.strategy`;

//eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isEnterpriseConnection(user: SessionWithUser["user"]) {
  //TODO(workos): handle enterprise connection
  // const userConnectionStrategyClaim = user[connectionStrategyClaim];
  // if (!userConnectionStrategyClaim) {
  //   return false;
  // }

  // return supportedEnterpriseConnectionStrategies.includes(
  //   userConnectionStrategyClaim
  // );
  return false;
}
