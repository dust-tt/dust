import { clientFetch } from "@app/lib/egress/client";
import { getFilePathContentApiPath } from "@app/lib/swr/files";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { documentContentType } from "@app/types/documents";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { z } from "zod";

const SavedRevisionSchema = z.object({
  revision: z.string().regex(/^[0-9]+$/),
});

export class DocumentSnapshotSaveError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DocumentSnapshotSaveError";
  }
}

export const saveDocumentSnapshot = async ({
  owner,
  canonicalPath,
  source,
  revision,
}: {
  owner: Pick<LightWorkspaceType, "sId">;
  canonicalPath: string;
  source: string;
  revision: string;
}): Promise<Result<{ revision: string }, DocumentSnapshotSaveError>> => {
  const response = await clientFetch(
    `${getFilePathContentApiPath(owner, canonicalPath)}?document=1`,
    {
      method: "PUT",
      headers: {
        "Content-Type": documentContentType,
        "If-Match": `"${revision}"`,
      },
      body: source,
    }
  );
  if (!response.ok) {
    const error = await getErrorFromResponse(response);
    return new Err(
      new DocumentSnapshotSaveError(response.status, error.message)
    );
  }
  return new Ok(SavedRevisionSchema.parse(await response.json()));
};
