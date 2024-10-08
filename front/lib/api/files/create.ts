import type { SupportedFileContentType } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";

export async function internalCreateFileFromPlainText({
  auth,
  title,
  content,
  contentType,
}: {
  auth: Authenticator;
  title: string;
  content: string;
  contentType: SupportedFileContentType;
}) {
  void auth, title, content, contentType;
}
