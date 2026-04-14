import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { TakeawaysResource } from "@app/lib/resources/takeaways_resource";

export class TakeawaysFactory {
  static async create(
    auth: Authenticator,
    space: SpaceResource
  ): Promise<TakeawaysResource> {
    return TakeawaysResource.makeNew(auth, {
      spaceId: space.id,
      actionItems: [],
      notableFacts: [],
      keyDecisions: [],
    });
  }
}
