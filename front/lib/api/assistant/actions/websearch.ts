import type { AgentActionSpecification, Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import type { WebsearchConfigurationType } from "@dust-tt/types/dist/front/assistant/actions/websearch";

import type { Authenticator } from "@app/lib/auth";

function websearchActionSpecification(arg0: {
  actionConfiguration: WebsearchConfigurationType;
  name: string;
  description: string;
}) {
  return {
    ...arg0,
    inputs: [
      {
        name: "query",
        description: "The query used to perform the web search.",
        type: "string",
      },
    ],
  } as AgentActionSpecification;
}

export function generateWebsearchSpecification(
  auth: Authenticator,
  {
    actionConfiguration,
    name = "web_search",
    description,
  }: {
    actionConfiguration: WebsearchConfigurationType;
    name?: string;
    description?: string;
  }
): Result<AgentActionSpecification, Error> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runWebsearchAction`");
  }

  const spec = websearchActionSpecification({
    actionConfiguration,
    name,
    description:
      description ?? "Perform a web search and return the top results.",
  });

  return new Ok(spec);
}
