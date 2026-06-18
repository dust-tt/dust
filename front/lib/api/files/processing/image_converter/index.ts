import { ConvertApiImageConverter } from "@app/lib/api/files/processing/image_converter/convertapi";
import { ImgproxyImageConverter } from "@app/lib/api/files/processing/image_converter/imgproxy";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { LoggerInterface } from "@app/types/shared/logger";

export * from "@app/lib/api/files/processing/image_converter/base";

export async function getImageConverter(
  auth: Authenticator,
  logger: LoggerInterface
): Promise<ImgproxyImageConverter | ConvertApiImageConverter> {
  if (await hasFeatureFlag(auth, "imgproxy_image_resize")) {
    return new ImgproxyImageConverter(logger);
  }

  return new ConvertApiImageConverter(logger);
}
