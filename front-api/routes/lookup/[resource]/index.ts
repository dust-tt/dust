import config from "@app/lib/api/config";
import type {
  InvitationsLookupRequestBodyType,
  InvitationsLookupResponse,
  ShareTokenLookupRequestBodyType,
  ShareTokenLookupResponse,
  UserLookupRequestBodyType,
  UserLookupResponse,
  WorkspaceLookupRequestBodyType,
  WorkspaceLookupResponse,
} from "@app/lib/api/regions/lookup";
import {
  handleLookupInvitations,
  handleLookupWorkspace,
  hasEmailLocalRegionAffinity,
  InvitationsLookupSchema,
  ShareTokenLookupSchema,
  UserLookupSchema,
  WorkspaceLookupSchema,
} from "@app/lib/api/regions/lookup";
import { getBearerToken } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { createHono } from "@front-api/lib/hono";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type {
  InvitationsLookupRequestBodyType,
  InvitationsLookupResponse,
  ShareTokenLookupRequestBodyType,
  ShareTokenLookupResponse,
  UserLookupRequestBodyType,
  UserLookupResponse,
  WorkspaceLookupRequestBodyType,
  WorkspaceLookupResponse,
};

type LookupResponseBody =
  | UserLookupResponse
  | WorkspaceLookupResponse
  | InvitationsLookupResponse
  | ShareTokenLookupResponse;

const ResourceParamSchema = z.object({
  resource: z.enum(["user", "workspace", "invitations", "share-token"]),
});

const BodySchema = z.union([
  UserLookupSchema,
  WorkspaceLookupSchema,
  InvitationsLookupSchema,
  ShareTokenLookupSchema,
]);

const app = createHono();

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
