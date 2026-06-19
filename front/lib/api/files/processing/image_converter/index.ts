import type { ImageConverter } from "@app/lib/api/files/processing/image_converter/base";
import { ConvertApiImageConverter } from "@app/lib/api/files/processing/image_converter/convertapi";
import { ImgproxyImageConverter } from "@app/lib/api/files/processing/image_converter/imgproxy";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";

export * from "@app/lib/api/files/processing/image_converter/base";

export async function getImageConverter(
  auth: Authenticator
): Promise<ImageConverter> {
  if (await hasFeatureFlag(auth, "imgproxy_image_resize")) {
    return new ImgproxyImageConverter();
  }

  return new ConvertApiImageConverter();
}
