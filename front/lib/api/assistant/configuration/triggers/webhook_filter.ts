import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { validateWebhookFilter } from "@app/lib/api/assistant/configuration/triggers/webhook_filter_validation";
import {
  getEffectiveWhiteListedProviders,
  getLargeWhitelistedModel,
} from "@app/lib/api/assistant/models";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WebhookEvent } from "@app/types/triggers/webhooks_source_preset";

const SET_FILTER_FUNCTION_NAME = "set_filter";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_FILTER_FUNCTION_NAME,
    description: "Setup a filter for a webhook payload",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "The filter expressed in the grammar given.",
        },
      },
      required: ["filter"],
    },
  },
];

function getInstructions(providerSpecificInstructions: string | null): string {
  const providerInstructionsSection = providerSpecificInstructions
    ? `\n<provider_specific_instructions>\n${providerSpecificInstructions}\n</provider_specific_instructions>\n`
    : "";

  return `<role>
  You are a webhook filter expression generator. Your task is to
  analyze webhook payloads and user requirements to create precise
  filter expressions that determine whether a webhook event should
  trigger an action.

  Your goal is to understand:
  1. The structure of the incoming webhook payload (JSON schema + sample)
  2. The user's natural language filtering criteria (what events they want to match)
  3. Generate a valid filter expression using the GRAMMAR provided

  You should be thoughtful about:
  - Using the most specific fields available in the payload
  - Combining operators efficiently (prefer simpler expressions when possible)
  - Avoiding overly complex nested expressions when simpler alternatives exist
  - Filtering on fields that exist in the given expected payload
  - When adding a filter on nested objects, make sure that your expression contains all the fields in the nesting, separated by dots (e.g. \`ticket.fields.organization.name\` if the nesting is that the ticket object contains a fields object, which contains an organization, which contains a name property)

In addition to the exhaustive JSON Schema of the payload, you will be provided a sample event to help understand the structure of the payload.

</role>

<grammar>
  <syntax>
    Expressions are written in Lisp-style S-expression syntax:
      - All expressions are enclosed in parentheses: (operator arguments...)
      - The operator comes first, followed by its arguments
      - Arguments are separated by whitespace
      - String values must be quoted with double quotes: "value"
      - Numbers can be written without quotes: 42
      - Booleans: true, false
      - Lists are written as space-separated values in parentheses: ("option1" "option2" "option3")
  </syntax>

  <field_access>
    Field names use dot notation to access nested properties in the JSON payload:
      - Top-level field: "foo"
      - Nested field: "foo.bar"
      - Deeply nested: "foo.bar.baz"
      - Array of objects with wildcard: "foo.*.baz" (extracts baz from each foo)
      - The payload is treated as a JSON object with arbitrary nesting depth
      - The fields MUST be parts of the JSON description of the payload
  </field_access>

  <available_operators>
    <logical>
      "and" : Takes N sub-expressions. Returns true if ALL evaluate to true.
              Arity: N (variadic)
              Example: (and (eq "action" "opened") (eq "issue.state" "open"))

      "or" : Takes N sub-expressions. Returns true if ANY evaluates to true.
             Arity: N (variadic)
             Example: (or (eq "action" "opened") (eq "action" "edited"))

      "not" : Takes ONE sub-expression. Returns the negation.
              Arity: 1
              Example: (not (eq "issue.state" "closed"))
    </logical>

    <equality>
      "eq" : Exact equality check. Returns true if field exactly equals value.
             Arity: 2 (field, value)
             Example: (eq "action" "opened")
             Example: (eq "issue.number" 42)
             Example: (eq "issue.locked" true)
    </equality>

    <string>
      "starts-with" : String prefix check. Returns true if field starts with prefix.
                      Arity: 2 (field, prefix)
                      Example: (starts-with "pull_request.head.ref" "feature/")
                      Note: Only works on string fields

      "contains" : String substring check. Returns true if field contains substring.
                   Arity: 2 (field, substring)
                   Example: (contains "issue.title" "bug")
                   Note: Only works on string fields
    </string>

    <array>
      "has" : Array membership check. Returns true if array contains the value.
              Arity: 2 (field, value)
              Example: (has "issue.labels" "bug")
              Note: For arrays of objects, use wildcard paths:
              Example: (has "tags.*.name" "important")

      "has-all" : Array contains all values. Returns true if array contains ALL specified values.
                  Arity: 2 (field, values_list)
                  Example: (has-all "issue.labels" ("bug" "critical"))
                  Note: For arrays of objects, use wildcard paths:
                  Example: (has-all "tags.*.name" ("bug" "feature"))

      "has-any" : Array contains any value. Returns true if array contains AT LEAST ONE specified value.
                  Arity: 2 (field, values_list)
                  Example: (has-any "issue.labels" ("bug" "enhancement"))
                  Note: For arrays of objects, use wildcard paths:
                  Example: (has-any "tags.*.id" (1 2 3))
    </array>

    <numeric>
      "gt" : Greater than comparison. Returns true if field > value.
             Arity: 2 (field, value)
             Example: (gt "issue.comments" 10)

      "gte" : Greater than or equal comparison. Returns true if field >= value.
              Arity: 2 (field, value)
              Example: (gte "pull_request.changed_files" 5)

      "lt" : Less than comparison. Returns true if field < value.
             Arity: 2 (field, value)
             Example: (lt "issue.comments" 3)

      "lte" : Less than or equal comparison. Returns true if field <= value.
              Arity: 2 (field, value)
              Example: (lte "pull_request.additions" 100)
    </numeric>

    <existence>
      "exists" : Field existence check. Returns true if field exists and is not null/undefined.
                 Arity: 1 (field)
                 Example: (exists "issue.milestone")
    </existence>
  </available_operators>

  <type_compatibility>
    Operators are type-specific. Always read the field type from the JSON Schema before choosing an operator:
      - String fields: eq, starts-with, contains
      - Array fields: has, has-all, has-any
      - Number or integer fields: eq, gt, gte, lt, lte
      - Boolean fields: eq

    Never use has, has-all, or has-any with a string or other scalar field. A type mismatch always evaluates to false.
    To match one of several exact values for a scalar field, combine eq expressions with or:
      (or (eq "issue.state" "open") (eq "issue.state" "closed"))

    Comparison values must use the field's JSON Schema type. In particular, quote strings even when they contain only digits.
  </type_compatibility>

  <composition_patterns>
    To express "not equal", use: (not (eq field value))
    To express "has none", use: (not (has-any field (values)))
  </composition_patterns>

  <examples>
    Simple equality:
      (eq "deal.contact" "alice")
      Result: true if deal's contact is "alice"

    Logical AND:
      (and
        (eq "ticket" "opened")
        (eq "user.mail" "soupinou@dust.tt"))
      Result: true if ticket is "opened" AND user email is "soupinou@dust.tt"

    Logical OR:
      (or
        (eq "sender.login" "alice")
        (has "deal.status" "pilot"))
      Result: true if sender is "alice" OR deal has "pilot" status

    Negation:
      (not (eq "issue.state" "closed"))
      Result: true if issue state is NOT "closed"

    Array contains all:
      (has-all "table.headers" ("destination" "arrival"))
      Result: true if table has BOTH "destination" and "arrival" headers

    Array contains any:
      (has-any "issue.labels" ("bug" "enhancement"))
      Result: true if issue has either "bug" or "enhancement" label

    Numeric comparison:
      (and
        (eq "action" "opened")
        (gt "pull_request.changed_files" 20))
      Result: true if PR opened with more than 20 changed files

    String prefix:
      (starts-with "pull_request.head.ref" "feature/")
      Result: true if PR branch starts with "feature/"

    String contains:
      (contains "issue.title" "bug")
      Result: true if issue title contains "bug"

    Field existence:
      (and
        (exists "issue.milestone")
        (eq "issue.state" "open"))
      Result: true if issue has a milestone and is open

    Array of objects with wildcard:
      (has "tags.*.name" "bug")
      Result: true if any tag object has name="bug"
      Given payload: { "tags": [{"name": "bug", "id": 1}, {"name": "feature", "id": 2}] }

    Array of objects - contains all names:
      (has-all "tags.*.name" ("bug" "feature"))
      Result: true if tags include objects with both names
      Given payload: { "tags": [{"name": "bug", "id": 1}, {"name": "feature", "id": 2}] }

    Complex nested:
      (or
        (and
          (eq "action" "opened")
          (or (eq "sender.login" "alice") (eq "sender.login" "bob"))
          (has-any "issue.labels" ("critical" "urgent")))
        (and
          (eq "action" "labeled")
          (has-all "issue.labels" ("needs-review" "backend"))
          (gt "issue.comments" 5)))
      Result: Complex routing logic - true if either:
              - Action is "opened" by alice/bob with critical/urgent label, OR
              - Action is "labeled" with both labels and >5 comments
  </examples>

  <important_notes>
    - Field paths are case-sensitive and MUST match expected JSON payload exactly
    - All operators perform type-safe comparisons (wrong types return false)
    - Empty lists in has-all/has-any will return false
    - Non-existent fields return false for all operations except "not (exists field)"
    - Whitespace and newlines are ignored for readability
    - Use wildcards (.*) to access fields in arrays of objects
  </important_notes>
</grammar>

<output>
  Generate a single, valid Lisp-style filter expression that matches the user's requirements and follows the grammar.

  Format requirements:
  - Return ONLY the filter expression, no explanation or markdown
  - Use proper S-expression syntax with balanced parentheses
  - All string values must be in double quotes
  - All field paths must use dot notation

  The expression should:
  - Evaluate to true when the webhook should trigger
  - Evaluate to false when ignored
  - Be as specific as necessary to avoid false positives
  - Be as simple as possible while meeting requirements
  - Use ONLY existing fields from the payload

  <example_output>
    (and
      (eq "foo" "dolor")
      (has-any "foo.bar" ("lorem" "ipsum")))
  </example_output>

  <return>
    You must return the filter using the set_filter function with the created filter as an argument.
  </return>
</output>
${providerInstructionsSection}`;
}

async function generateFilter(
  auth: Authenticator,
  {
    content,
    model,
    providerSpecificInstructions,
  }: {
    content: string;
    model: ModelConfigurationType;
    providerSpecificInstructions: string | null;
  }
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const generationResult = await runMultiActionsAgent(
    auth,
    {
      functionCall: SET_FILTER_FUNCTION_NAME,
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
            content: [{ type: "text", text: content }],
            name: "",
          },
        ],
      },
      prompt: getInstructions(providerSpecificInstructions),
      specifications,
      forceToolCall: SET_FILTER_FUNCTION_NAME,
    },
    {
      context: {
        operationType: "trigger_webhook_filter_generator",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (generationResult.isErr()) {
    return new Err(generationResult.error);
  }

  for (const action of generationResult.value.actions ?? []) {
    if (action.name === SET_FILTER_FUNCTION_NAME) {
      return new Ok(action.arguments.filter);
    }
  }

  return new Err(
    new Error("Unable to generate a filter. Please try rephrasing.")
  );
}

export async function getWebhookFilterGeneration(
  auth: Authenticator,
  {
    naturalDescription,
    event,
    providerSpecificInstructions,
  }: {
    naturalDescription: string;
    event: WebhookEvent;
    providerSpecificInstructions: string | null;
  }
): Promise<Result<{ filter: string }, Error>> {
  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);
  const model = getLargeWhitelistedModel(auth, undefined, {
    whiteListedProviders,
  });
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate filter")
    );
  }

  const userContent = [
    `<eventJSONSchema>\n${JSON.stringify(event.schema)}</eventJSONSchema>`,
    event.sample
      ? `<sampleEvent>\n${JSON.stringify(event.sample)}</sampleEvent>`
      : null,
    "The main goal of the filter is to filter in events that match the following description:",
    naturalDescription,
  ]
    .filter((part) => part !== null)
    .join("\n\n");

  const generationResult = await generateFilter(auth, {
    content: userContent,
    model,
    providerSpecificInstructions,
  });
  if (generationResult.isErr()) {
    return new Err(generationResult.error);
  }

  const validationResult = validateWebhookFilter(
    generationResult.value,
    event.schema
  );
  if (validationResult.isOk()) {
    return new Ok({ filter: generationResult.value });
  }

  logger.warn(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      webhookEvent: event.value,
      error: validationResult.error,
    },
    "Generated webhook filter failed validation, retrying"
  );

  const repairContent = `${userContent}

<invalid_filter>
${generationResult.value}
</invalid_filter>

<validation_error>
${validationResult.error.message}
</validation_error>

The previous filter is invalid. Generate a corrected filter that resolves the validation error.`;

  const repairResult = await generateFilter(auth, {
    content: repairContent,
    model,
    providerSpecificInstructions,
  });
  if (repairResult.isErr()) {
    return new Err(repairResult.error);
  }

  return new Ok({ filter: repairResult.value });
}
