import config from "@app/lib/api/config";
import {
  buildBrandingAssetPublicUrl,
  buildBrandingAssetStoragePath,
} from "@app/lib/api/workspace_branding/paths";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import { DocumentRenderer } from "@app/types/shared/document_renderer";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function generateAndStoreOgImage(
  auth: Authenticator
): Promise<Result<void, Error>> {
  const documentRendererUrl = config.getDocumentRendererUrl();
  if (!documentRendererUrl) {
    return new Err(new Error("Document renderer not configured."));
  }

  const workspace = auth.getNonNullableWorkspace();
  const logoUrl = buildBrandingAssetPublicUrl(
    { asset: "logo", wId: workspace.sId },
    {
      baseUrl: config.getDocumentRendererApiUrl(),
    }
  );
  const pageUrl =
    `${config.getDocumentRendererAppUrl()}/share/og/${workspace.sId}` +
    `?name=${encodeURIComponent(workspace.name)}` +
    `&logoUrl=${encodeURIComponent(logoUrl)}`;

  const renderer = new DocumentRenderer(documentRendererUrl, logger);
  const result = await renderer.captureScreenshot({
    url: pageUrl,
    waitForExpression: "document.body.getAttribute('data-og-ready') === 'true'",
  });
  if (result.isErr()) {
    return new Err(result.error);
  }

  const ogPath = buildBrandingAssetStoragePath({
    asset: "og",
    wId: workspace.sId,
  });
  try {
    await getPrivateUploadBucket()
      .file(ogPath)
      .save(result.value, { contentType: "image/png", resumable: false });

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      { wId: workspace.sId, error: normalizeError(err) },
      "Error saving OG image"
    );

    return new Err(normalizeError(err));
  }
}
