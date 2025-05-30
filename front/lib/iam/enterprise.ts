import type { SessionWithUser } from "@app/lib/iam/provider";
import { supportedEnterpriseConnectionStrategies } from "@app/types";

// This code runs in SSR, where environment variables are replaced at build time.
const connectionStrategyClaim = `${process.env.AUTH0_CLAIM_NAMESPACE}connection.strategy`;

export function isEnterpriseConnection(user: SessionWithUser["user"]) {
  const userConnectionStrategyClaim = user[connectionStrategyClaim];
  if (!userConnectionStrategyClaim) {
    return false;
  }

  return supportedEnterpriseConnectionStrategies.includes(
    userConnectionStrategyClaim
  );
}
