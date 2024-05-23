import type { AgentActionSpecification, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { WebsearchConfigurationType } from "@dust-tt/types/dist/front/assistant/actions/websearch";

import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import type { Authenticator } from "@app/lib/auth";

/**
 * Params generation.
 */

export class WebsearchConfigurationServerRunner extends BaseActionConfigurationServerRunner<WebsearchConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    {
      name,
      description,
    }: { name?: string | undefined; description?: string | undefined }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runWebsearchAction`"
      );
    }

    return new Ok({
      name: name ?? "web_search",
      description:
        description ?? "Perform a web search and return the top results.",
      inputs: [
        {
          name: "query",
          description: "The query used to perform the web search.",
          type: "string",
        },
      ],
    });
  }

  run(
    auth: Authenticator,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown, any, unknown> {
    throw new Error(
      "Method not implemented." +
        JSON.stringify(runParams) +
        JSON.stringify(customParams) +
        JSON.stringify(auth)
    );
  }
}
