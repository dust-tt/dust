/** @ignoreswagger */
import { resolveGoDestination } from "@marketing/lib/go/resolveDestination";
import { assertNever } from "@marketing/types/shared/utils/assert_never";
import { isString } from "@marketing/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

type GoResolveResponse =
  | { destination: string }
  | { error: "template_not_found" | "invalid_slug" | "internal_server_error" };

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GoResolveResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "internal_server_error" });
  }

  const slug = req.query.slug;
  if (!isString(slug) || slug.trim() === "") {
    return res.status(400).json({ error: "invalid_slug" });
  }

  const cookieHeader = req.headers.cookie ?? "";
  const result = await resolveGoDestination(slug, cookieHeader);

  switch (result.kind) {
    case "redirect":
      return res.status(200).json({ destination: result.destination });
    case "not_found":
      return res.status(404).json({ error: "template_not_found" });
    case "error":
      return res.status(500).json({ error: "internal_server_error" });
    default:
      assertNever(result);
  }
}
