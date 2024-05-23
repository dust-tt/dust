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
        description: "The search query to run.",
        type: "string",
      },
    ],
  } as AgentActionSpecification;
}

export async function generateWebsearchSpecification(
  auth: Authenticator,
  {
    actionConfiguration,
    name = "websearch",
    description,
  }: {
    actionConfiguration: WebsearchConfigurationType;
    name?: string;
    description?: string;
  }
): Promise<Result<AgentActionSpecification, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runWebsearchAction`");
  }

  const spec = websearchActionSpecification({
    actionConfiguration,
    name,
    description:
      description ?? "Search the web for information on a given topic.",
  });

  return new Ok(spec);
}
