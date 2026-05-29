import { readInteractiveContentFile } from "@app/lib/api/files/read";
import type {
  FileShareScope,
  FileTypeWithMetadata,
  SharingGrantType,
} from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export interface GetPokeFileResponseBody {
  content: string;
  file: FileTypeWithMetadata;
  shareInfo: {
    scope: FileShareScope;
    sharedAt: number;
    shareUrl: string;
  } | null;
  sharingGrants: SharingGrantType[];
}

// Mounted at /api/poke/workspaces/:wId/files/:sId.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<GetPokeFileResponseBody> => {
  const auth = ctx.get("auth");
  const sId = ctx.req.param("sId");
  if (!sId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The sId parameter is required.",
      },
    });
  }

  const result = await readInteractiveContentFile(auth, sId);
  if (result.isErr()) {
    const err = result.error;
    switch (err) {
      case "file_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "file_not_found",
            message: "File not found.",
          },
        });

      case "not_interactive_content":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Only interactive content files can be viewed.",
          },
        });

      default:
        return assertNever(err);
    }
  }

  return ctx.json(result.value);
});

export default app;
