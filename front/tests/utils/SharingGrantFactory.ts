import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import type { SharingGrantTarget } from "@app/types/sharing_grants";
import assert from "assert";

export class SharingGrantFactory {
  static async create(
    auth: Authenticator,
    file: FileResource,
    target: SharingGrantTarget
  ): Promise<SharingGrantResource> {
    await file.ensureShareableFrame(auth);
    const result = await SharingGrantResource.add(
      auth,
      file,
      target.kind === "email"
        ? { emails: [target.value] }
        : { domains: [target.value] }
    );
    assert(result.isOk(), "Expected valid sharing grant targets");
    const [grant] = result.value;
    assert(grant, "Expected a newly created sharing grant");
    return grant;
  }
}
