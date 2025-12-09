import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, getSmallWhitelistedModel, Ok } from "@app/types";

// Safeguards to avoid sending a huge number of skills to the LLM
const MAX_SKILLS_SENT_TO_LLM = 100;
const MAX_DESCRIPTION_LENGTH = 500;

const SET_SIMILAR_SKILLS_FUNCTION_NAME = "set_similar_skills";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_SIMILAR_SKILLS_FUNCTION_NAME,
    description: "Set the similar skill ids",
    inputSchema: {
      type: "object",
      properties: {
        similar_skills_array: {
          type: "array",
          description: "An array of similar skill ids.",
          items: {
            type: "string",
          },
        },
      },
      required: ["similar_skills_array"],
    },
  },
];

const PROMPT = `# Role
The user is creating a new skill to be added to thei agents.
You must find if there is existing similar skills in the user's workspace to avoid duplicates.

# Instuctions

Given the natural description of the new skill, return a list of similar skill IDs already present in the user's workspace.
Use the set_similar_skills function to return the similar skill IDs as an array of integers.

Critically, only return skills that are truly similar to the new skill description.
If there is n o similar skill, return an empty array, THIS IS TOTALLY OK.

Skills are consider similar if they do similar actions over the same platforms or services.

# Example
## Example 1:
Input: "This skills handle creation of support ticket on github"
Existing skill:
---
Skill ID abc12:
"Open support cards on github.com"
---
Skill ID xxx15:
"Read and edit Jira tickets"
---
Skill ID 20aaa:
"Create issues on GitHub repositories"
---
Skill ID 25iju:
"Manage customer support emails"
 
Output: 
set_similar_skills({
  "similar_skills_array": [abc12, 20aaa]
})

## Example 2:
Input: "This allow the creation of vizualition similar to power point slides which can be shared with team members"
Skill ID abc12:
"Open support cards on github.com"
---
Skill ID xxx15:
"Read and edit Jira tickets"
---
Skill ID 20aaa:
"Create issues on GitHub repositories"
---
Skill ID 25iju:
"Manage customer support emails"

Output: 
set_similar_skills({
  "similar_skills_array": []
})
`;

function truncateDescription(description: string): string {
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return description.slice(0, MAX_DESCRIPTION_LENGTH);
  }
  return description;
}

export async function getSimilarSkills(
  auth: Authenticator,
  inputs: { naturalDescription: string }
): Promise<Result<{ similar_skills: string[] }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate cron rule")
    );
  }

  // Retrieve existing skills
  const skills: SkillConfigurationResource[] =
    await SkillConfigurationResource.fetchAllAvailableSkills(
      auth,
      MAX_SKILLS_SENT_TO_LLM
    );
  if (skills.length === MAX_SKILLS_SENT_TO_LLM) {
    logger.warn(
      { workspaceId: owner.sId },
      "The number of skills fetched reached the limit. Some skills might not be considered in the similarity check."
    );
  }

  const existingSkills = skills
    .map(
      (s) => `Skill ID ${s.sId}:
"${truncateDescription(s.description)}"`
    )
    .join("\n---\n");
  const inputText = `Input description:"${inputs.naturalDescription}"
Existing skills:
${existingSkills}
`;

  const res = await runMultiActionsAgent(
    auth,
    {
      modelId: model.modelId,
      providerId: model.providerId,
      temperature: 0.7,
      useCache: false,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: inputText }],
            name: "",
          },
        ],
      },
      prompt: PROMPT,
      specifications,
    },
    {
      context: {
        operationType: "skills_similarity_checker",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  let similar_skills: string[] | null = null;

  if (res.value.actions) {
    for (const action of res.value.actions) {
      if (action.name === SET_SIMILAR_SKILLS_FUNCTION_NAME) {
        similar_skills = action.arguments.similar_skills_array;
      }
    }
  }

  if (!similar_skills) {
    return new Err(new Error("No similar skills generated"));
  }

  return new Ok({ similar_skills: similar_skills });
}
