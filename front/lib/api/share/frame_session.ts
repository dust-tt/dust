import config from "@app/lib/api/config";
import { ExternalViewerSessionModel } from "@app/lib/resources/storage/models/files";
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import crypto from "crypto";
import type { NextApiResponse } from "next";
import { Op } from "sequelize";

export const FRAME_SESSION_COOKIE_NAME = "dust_frame_session";

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days.

/**
 * Create an external viewer session for a verified email and set the session cookie.
 */
export async function createFrameSession(
  res: NextApiResponse,
  workspace: LightWorkspaceType,
  { email }: { email: string }
): Promise<void> {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  await ExternalViewerSessionModel.create({
    email,
    expiresAt,
    sessionToken,
    workspaceId: workspace.id,
  });

  const domain = config.getWorkOSSessionCookieDomain();
  const secureFlag = isDevelopment() ? "" : "; Secure";
  const cookieValue = `${FRAME_SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}`;

  if (domain) {
    res.setHeader("Set-Cookie", [`${cookieValue}; Domain=${domain}`]);
  } else {
    res.setHeader("Set-Cookie", [cookieValue]);
  }
}

/**
 * Look up a valid (non-expired) external viewer session from the cookie value.
 * Returns the session's verified email, or null if invalid/expired.
 */
export async function getFrameSessionEmail({
  sessionToken,
  workspaceId,
}: {
  sessionToken: string;
  workspaceId: ModelId;
}): Promise<string | null> {
  const session = await ExternalViewerSessionModel.findOne({
    where: {
      sessionToken,
      workspaceId,
      expiresAt: { [Op.gt]: new Date() },
    },
  });

  return session?.email ?? null;
}
