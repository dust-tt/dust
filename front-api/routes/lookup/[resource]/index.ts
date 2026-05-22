import config from "@app/lib/api/config";
import {
  handleLookupInvitations,
  handleLookupWorkspace,
  hasEmailLocalRegionAffinity,
} from "@app/lib/api/regions/lookup";
import { getBearerToken } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import type { PendingInvitationOption } from "@app/types/membership_invitation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { Hono } from "hono";
import { z } from "zod";

export type WorkspaceLookupResponse = {
  workspace: {
    sId: string;
  } | null;
};

export type UserLookupResponse = {
  exists: boolean;
};

export type InvitationsLookupResponse = {
  pendingInvitations: PendingInvitationOption[];
};

export type ShareTokenLookupResponse = {
  exists: boolean;
};

type LookupResponseBody =
  | UserLookupResponse
  | WorkspaceLookupResponse
  | InvitationsLookupResponse
  | ShareTokenLookupResponse;

const ExternalUserCodec = z.object({
  email: z.string(),
  email_verified: z.boolean(),
});

const UserLookupSchema = z.object({
  user: ExternalUserCodec,
});

const WorkspaceLookupSchema = z.object({
  workspace: z.string(),
});

const InvitationsLookupSchema = z.object({
  email: z.string(),
});

const ShareTokenLookupSchema = z.object({
  token: z.string(),
});

export type UserLookupRequestBodyType = z.infer<typeof UserLookupSchema>;
export type WorkspaceLookupRequestBodyType = z.infer<
  typeof WorkspaceLookupSchema
>;
export type InvitationsLookupRequestBodyType = z.infer<
  typeof InvitationsLookupSchema
>;
export type ShareTokenLookupRequestBodyType = z.infer<
  typeof ShareTokenLookupSchema
>;

const ResourceParamSchema = z.object({
  resource: z.enum(["user", "workspace", "invitations", "share-token"]),
});

const BodySchema = z.union([
  UserLookupSchema,
  WorkspaceLookupSchema,
  InvitationsLookupSchema,
  ShareTokenLookupSchema,
]);

const app = new Hono();

app.post(
  "/",
  validate("param", ResourceParamSchema),
  validate("json", BodySchema),
  async (ctx): HandlerResult<LookupResponseBody> => {
    const bearerTokenRes = await getBearerToken(
      ctx.req.header("authorization")
    );
    if (bearerTokenRes.isErr()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "The request does not have valid authentication credentials",
        },
      });
    }

    if (bearerTokenRes.value !== config.getRegionResolverSecret()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "invalid_basic_authorization_error",
          message: "Invalid token",
        },
      });
    }

    const { resource } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    switch (resource) {
      case "user": {
        const bodyValidation = UserLookupSchema.safeParse(body);
        if (!bodyValidation.success) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body for user lookup.",
            },
          });
        }
        return ctx.json({
          exists: await hasEmailLocalRegionAffinity(bodyValidation.data.user),
        });
      }

      case "workspace": {
        const bodyValidation = WorkspaceLookupSchema.safeParse(body);
        if (!bodyValidation.success) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body for workspace lookup.",
            },
          });
        }
        return ctx.json(await handleLookupWorkspace(bodyValidation.data));
      }

      case "invitations": {
        const bodyValidation = InvitationsLookupSchema.safeParse(body);
        if (!bodyValidation.success) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body for invitations lookup.",
            },
          });
        }
        return ctx.json(
          await handleLookupInvitations(bodyValidation.data.email)
        );
      }

      case "share-token": {
        const bodyValidation = ShareTokenLookupSchema.safeParse(body);
        if (!bodyValidation.success) {
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Invalid request body for share-token lookup.",
            },
          });
        }
        const result = await FileResource.fetchByShareToken(
          bodyValidation.data.token
        );
        return ctx.json({ exists: result.isOk() });
      }

      default:
        assertNever(resource);
    }
  }
);

export default app;
