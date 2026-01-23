import { z } from "zod";

import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

const LinearTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
});

const LinearWebhookSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  url: z.string(),
  resourceTypes: z.array(z.string()),
  team: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
});

const LinearGraphQLResponseSchema = z.object({
  data: z.record(z.any()).nullable(),
  errors: z
    .array(
      z.object({
        message: z.string(),
      })
    )
    .optional(),
});

export type LinearTeamType = z.infer<typeof LinearTeamSchema>;
export type LinearWebhookType = z.infer<typeof LinearWebhookSchema>;

export class LinearClient {
  private readonly apiUrl = "https://api.linear.app/graphql";

  constructor(private readonly accessToken: string) {}

  private async graphqlRequest(
    query: string,
    variables?: Record<string, any>
  ): Promise<Result<Record<string, any> | null, Error>> {
    try {
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Err(
          new Error(
            `Linear API request failed: ${response.statusText} - ${errorText}`
          )
        );
      }

      const json = await response.json();
      const result = LinearGraphQLResponseSchema.parse(json);

      if (result.errors && result.errors.length > 0) {
        return new Err(
          new Error(result.errors.map((e) => e.message).join(", "))
        );
      }

      return new Ok(result.data);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(new Error(error.message));
    }
  }

  async getTeams(): Promise<Result<LinearTeamType[], Error>> {
    const query = `
      query {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `;

    const result = await this.graphqlRequest(query);

    if (result.isErr()) {
      return result;
    }

    if (!result.value) {
      return new Err(new Error("GraphQL response data is null"));
    }

    try {
      const teams = result.value.teams.nodes.map((team: unknown) =>
        LinearTeamSchema.parse(team)
      );
      return new Ok(teams);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(new Error(`Failed to parse teams: ${error.message}`));
    }
  }

  async createWebhook({
    url,
    resourceTypes,
    teamId,
  }: {
    url: string;
    resourceTypes: string[];
    teamId: string;
  }): Promise<Result<LinearWebhookType, Error>> {
    const query = `
      mutation WebhookCreate($input: WebhookCreateInput!) {
        webhookCreate(input: $input) {
          success
          webhook {
            id
            enabled
            url
            resourceTypes
            team {
              id
              name
            }
          }
        }
      }
    `;

    const variables = {
      input: {
        url,
        resourceTypes,
        teamId,
      },
    };

    const result = await this.graphqlRequest(query, variables);

    if (result.isErr()) {
      return result;
    }

    if (!result.value) {
      return new Err(new Error("GraphQL response data is null"));
    }

    if (!result.value.webhookCreate.success) {
      return new Err(new Error("Failed to create webhook"));
    }

    try {
      const webhook = LinearWebhookSchema.parse(
        result.value.webhookCreate.webhook
      );
      return new Ok(webhook);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  async deleteWebhook(webhookId: string): Promise<Result<void, Error>> {
    const query = `
      mutation WebhookDelete($id: String!) {
        webhookDelete(id: $id) {
          success
        }
      }
    `;

    const variables = { id: webhookId };

    const result = await this.graphqlRequest(query, variables);

    if (result.isErr()) {
      return result;
    }

    if (!result.value) {
      return new Err(new Error("GraphQL response data is null"));
    }

    if (!result.value.webhookDelete.success) {
      return new Err(new Error("Failed to delete webhook"));
    }

    return new Ok(undefined);
  }

  async getWebhooks(): Promise<Result<LinearWebhookType[], Error>> {
    const query = `
      query {
        webhooks {
          nodes {
            id
            enabled
            url
            resourceTypes
            team {
              id
              name
            }
            allPublicTeams
          }
        }
      }
    `;

    const result = await this.graphqlRequest(query);

    if (result.isErr()) {
      return result;
    }

    if (!result.value) {
      return new Err(new Error("GraphQL response data is null"));
    }

    try {
      const webhooks = result.value.webhooks.nodes.map((webhook: unknown) =>
        LinearWebhookSchema.parse(webhook)
      );
      return new Ok(webhooks);
    } catch (err) {
      const error = normalizeError(err);
      return new Err(new Error(`Failed to parse webhooks: ${error.message}`));
    }
  }
}
