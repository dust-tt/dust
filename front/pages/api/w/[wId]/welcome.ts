import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { EmailProviderType } from "@app/lib/utils/email_provider_detection";
import { detectEmailProvider } from "@app/lib/utils/email_provider_detection";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetWelcomeResponseBody = {
  isFirstAdmin: boolean;
  emailProvider: EmailProviderType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWelcomeResponseBody | void>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
  const isAdmin = auth.isAdmin();

  // Check if this is the first admin (only one member in the workspace).
  const { total: membersTotal } =
    await MembershipResource.getMembershipsForWorkspace({
      workspace: owner,
    });
  const isFirstAdmin = isAdmin && membersTotal === 1;

  const userJson = user.toJSON();
  const emailProvider = await detectEmailProvider(
    userJson.email,
    `user-${userJson.sId}`
  );

  return res.status(200).json({
    isFirstAdmin,
    emailProvider,
  });
}

export default withSessionAuthenticationForWorkspace(handler, {
  doesNotRequireCanUseProduct: true,
});
