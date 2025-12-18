import { z } from "zod";

import { pluralize } from "@app/types";

const PageInfoSchema = z.object({
  endCursor: z.string().optional().nullable(),
  hasNextPage: z.boolean().optional().nullable(),
  hasPreviousPage: z.boolean().optional().nullable(),
  startCursor: z.string().optional().nullable(),
});

const VantaOwnerSchema = z
  .union([
    z.object({
      id: z.string().optional(),
      displayName: z.string().optional().nullable(),
      emailAddress: z.string().optional().nullable(),
    }),
    z.string(),
  ])
  .optional()
  .nullable();

const VantaTestSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    failureDescription: z.string().optional().nullable(),
    remediationDescription: z.string().optional().nullable(),
    lastTestRunDate: z.string().optional().nullable(),
    latestFlipDate: z.string().nullable().optional(),
    integrations: z.array(z.string()).optional().nullable(),
    owner: VantaOwnerSchema.nullable(),
    version: z
      .object({
        major: z.number().optional().nullable(),
        minor: z.number().optional().nullable(),
        _id: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
    deactivatedStatusInfo: z
      .object({
        isDeactivated: z.boolean().optional(),
        deactivatedReason: z.string().optional().nullable(),
        lastUpdatedDate: z.string().nullable(),
      })
      .optional()
      .nullable(),
    remediationStatusInfo: z
      .object({
        status: z.string().optional().nullable(),
        itemCount: z.number().optional().nullable(),
        soonestRemediateByDate: z.string().nullable().optional(),
      })
      .optional()
      .nullable(),
  })
  .passthrough();

export const VantaTestsResponseSchema = z.object({
  results: z.object({
    pageInfo: PageInfoSchema,
    data: z.array(VantaTestSchema),
  }),
});

const VantaTestEntitySchema = z
  .object({
    id: z.string().optional().nullable(),
    entityStatus: z.enum(["FAILING", "DEACTIVATED"]).optional().nullable(),
    displayName: z.string().optional().nullable(),
    responseType: z.string().optional().nullable(),
    deactivatedReason: z.string().nullable().optional(),
    lastUpdatedDate: z.string().optional().nullable(),
    createdDate: z.string().optional().nullable(),
  })
  .passthrough();

export const VantaTestEntitiesResponseSchema = z.object({
  results: z.object({
    pageInfo: PageInfoSchema,
    data: z.array(VantaTestEntitySchema),
  }),
});

const VantaControlSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    externalId: z.string().nullable().optional(),
    source: z.string().optional().nullable(),
    domains: z.array(z.string()).optional().nullable(),
    role: z.string().nullable().optional(),
    customFields: z
      .array(
        z.object({
          label: z.string(),
          value: z.unknown(),
        })
      )
      .optional()
      .nullable(),
    owner: VantaOwnerSchema.nullable(),
  })
  .passthrough();

export const VantaControlsResponseSchema = z.union([
  z.object({
    results: z.object({
      pageInfo: PageInfoSchema,
      data: z.array(VantaControlSchema),
    }),
  }),
  VantaControlSchema,
]);

const VantaDocumentSchema = z
  .object({
    id: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    isSensitive: z.boolean().optional().nullable(),
    ownerId: z.string().nullable().optional(),
    uploadStatus: z.string().optional().nullable(),
    uploadStatusDate: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .passthrough();

export const VantaDocumentsResponseSchema = z.union([
  z.object({
    results: z.object({
      pageInfo: PageInfoSchema,
      data: z.array(VantaDocumentSchema),
    }),
  }),
  VantaDocumentSchema,
]);

const VantaIntegrationSchema = z
  .object({
    integrationId: z.string().optional().nullable(),
    displayName: z.string().optional().nullable(),
    resourceKinds: z.array(z.string()).optional().nullable(),
    connections: z
      .array(
        z.object({
          connectionId: z.string().optional().nullable(),
          isDisabled: z.boolean().optional().nullable(),
          connectionErrorMessage: z.string().nullable().optional(),
        })
      )
      .optional()
      .nullable(),
  })
  .passthrough();

export const VantaIntegrationsResponseSchema = z.union([
  z.object({
    results: z.object({
      pageInfo: PageInfoSchema,
      data: z.array(VantaIntegrationSchema),
    }),
  }),
  VantaIntegrationSchema,
]);

const VantaFrameworkSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    completionPercentage: z.number().optional().nullable(),
    status: z.string().optional().nullable(),
    controlCount: z.number().optional().nullable(),
  })
  .passthrough();

export const VantaFrameworksResponseSchema = z.union([
  z.object({
    results: z.object({
      pageInfo: PageInfoSchema,
      data: z.array(VantaFrameworkSchema),
    }),
  }),
  VantaFrameworkSchema,
]);

const VantaPersonSchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z
      .object({
        display: z.string().optional().nullable(),
        first: z.string().optional().nullable(),
        last: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
    emailAddress: z.string().optional().nullable(),
    groupIds: z.array(z.string()).optional().nullable(),
    employment: z
      .object({
        status: z.enum(["CURRENT", "FORMER"]).optional().nullable(),
        jobTitle: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
      })
      .optional()
      .nullable(),
    leaveInfo: z.unknown().optional().nullable(),
    sources: z.record(z.unknown()).optional().nullable(),
    tasksSummary: z.record(z.unknown()).optional().nullable(),
  })
  .passthrough();

export const VantaPeopleResponseSchema = z.union([
  z.object({
    results: z.object({
      pageInfo: PageInfoSchema,
      data: z.array(VantaPersonSchema),
    }),
  }),
  VantaPersonSchema,
]);

const VantaRiskSchema = z
  .object({
    riskId: z.string().optional().nullable(),
    categories: z.array(z.string()).optional().nullable(),
    description: z.string().nullable().optional(),
    reviewStatus: z
      .enum(["PENDING", "APPROVED", "REJECTED"])
      .nullable()
      .optional(),
    likelihood: z.number().nullable().optional(),
    impact: z.number().nullable().optional(),
    treatment: z
      .enum(["Mitigate", "Transfer", "Avoid", "Accept"])
      .nullable()
      .optional(),
    owner: z.string().nullable().optional(),
    residualLikelihood: z.number().nullable().optional(),
    residualImpact: z.number().nullable().optional(),
    ciaCategories: z.array(z.string()).optional().nullable(),
    note: z.string().nullable().optional(),
    riskRegister: z.string().nullable().optional(),
    customFields: z
      .array(
        z.object({
          label: z.string().optional().nullable(),
          value: z.unknown(),
        })
      )
      .optional()
      .nullable(),
    isArchived: z.boolean().optional().nullable(),
    requiredApprovers: z.array(z.string()).optional().nullable(),
  })
  .passthrough();

export const VantaRisksResponseSchema = z.union([
  z.object({
    results: z.object({
      pageInfo: PageInfoSchema,
      data: z.array(VantaRiskSchema),
    }),
  }),
  VantaRiskSchema,
]);

const VantaVulnerabilityDeactivateMetadataSchema = z
  .object({
    deactivatedAt: z.string().optional().nullable(),
    deactivatedBy: z.string().optional().nullable(),
    deactivationReason: z.string().optional().nullable(),
  })
  .passthrough()
  .nullable();

const VantaVulnerabilitySchema = z
  .object({
    id: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    integrationId: z.string().optional().nullable(),
    packageIdentifier: z.string().nullable().optional(),
    vulnerabilityType: z
      .enum(["CONFIGURATION", "COMMON", "GROUPED"])
      .optional()
      .nullable(),
    targetId: z.string().optional().nullable(),
    firstDetectedDate: z.string().optional().nullable(),
    sourceDetectedDate: z.string().nullable().optional(),
    lastDetectedDate: z.string().nullable().optional(),
    severity: z
      .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
      .optional()
      .nullable(),
    cvssSeverityScore: z.number().nullable().optional(),
    scannerScore: z.number().nullable().optional(),
    isFixable: z.boolean().optional().nullable(),
    remediateByDate: z.string().nullable().optional(),
    relatedVulns: z.array(z.string()).optional().nullable(),
    relatedUrls: z.array(z.string()).optional().nullable(),
    externalURL: z.string().optional().nullable(),
    scanSource: z.string().optional().nullable(),
    deactivateMetadata: VantaVulnerabilityDeactivateMetadataSchema,
  })
  .passthrough();

export const VantaVulnerabilitiesResponseSchema = z.object({
  results: z.object({
    pageInfo: PageInfoSchema,
    data: z.array(VantaVulnerabilitySchema),
  }),
});

const VantaDocumentResourceSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

export const VantaDocumentResourcesResponseSchema = z.object({
  results: z.object({
    pageInfo: PageInfoSchema,
    data: z.array(VantaDocumentResourceSchema),
  }),
});

const VantaIntegrationResourceSchema = z
  .object({
    id: z.string().optional().nullable(),
    displayName: z.string().optional().nullable(),
    kind: z.string().optional().nullable(),
    inScope: z.boolean().optional().nullable(),
    account: z.string().optional().nullable(),
    region: z.string().optional().nullable(),
    owner: z.union([z.string(), z.null()]).optional(),
    description: z.string().optional().nullable(),
    createdDate: z.string().optional().nullable(),
  })
  .passthrough();

export const VantaIntegrationResourcesResponseSchema = z.union([
  z.object({
    results: z.object({
      pageInfo: PageInfoSchema,
      data: z.array(VantaIntegrationResourceSchema),
    }),
  }),
  z.array(VantaIntegrationResourceSchema),
  VantaIntegrationResourceSchema,
  z.object({
    data: VantaIntegrationResourceSchema,
  }),
]);

export type VantaTestsResponse = z.infer<typeof VantaTestsResponseSchema>;
export type VantaTestEntitiesResponse = z.infer<
  typeof VantaTestEntitiesResponseSchema
>;
export type VantaControlsResponse = z.infer<typeof VantaControlsResponseSchema>;
export type VantaDocumentsResponse = z.infer<
  typeof VantaDocumentsResponseSchema
>;
export type VantaDocumentResourcesResponse = z.infer<
  typeof VantaDocumentResourcesResponseSchema
>;
export type VantaIntegrationsResponse = z.infer<
  typeof VantaIntegrationsResponseSchema
>;
export type VantaIntegrationResourcesResponse = z.infer<
  typeof VantaIntegrationResourcesResponseSchema
>;
export type VantaFrameworksResponse = z.infer<
  typeof VantaFrameworksResponseSchema
>;
export type VantaPeopleResponse = z.infer<typeof VantaPeopleResponseSchema>;
export type VantaRisksResponse = z.infer<typeof VantaRisksResponseSchema>;
export type VantaVulnerabilitiesResponse = z.infer<
  typeof VantaVulnerabilitiesResponseSchema
>;

type VantaTest = z.infer<typeof VantaTestSchema>;
type VantaTestEntity = z.infer<typeof VantaTestEntitySchema>;
type VantaControl = z.infer<typeof VantaControlSchema>;
type VantaDocument = z.infer<typeof VantaDocumentSchema>;
type VantaIntegration = z.infer<typeof VantaIntegrationSchema>;
type VantaFramework = z.infer<typeof VantaFrameworkSchema>;
type VantaPerson = z.infer<typeof VantaPersonSchema>;
type VantaRisk = z.infer<typeof VantaRiskSchema>;
type VantaVulnerability = z.infer<typeof VantaVulnerabilitySchema>;
type VantaDocumentResource = z.infer<typeof VantaDocumentResourceSchema>;
type VantaIntegrationResource = z.infer<typeof VantaIntegrationResourceSchema>;

function normalizeResponse<T extends object>(
  response:
    | {
        results: {
          pageInfo: z.infer<typeof PageInfoSchema>;
          data: T[];
        };
      }
    | T
): {
  items: T[];
  pageInfo: z.infer<typeof PageInfoSchema> | null;
} {
  if ("results" in response && typeof response === "object") {
    return {
      items: response.results.data,
      pageInfo: response.results.pageInfo,
    };
  } else {
    return {
      items: [response],
      pageInfo: null,
    };
  }
}

export function renderTests(response: VantaTestsResponse): string {
  const { items, pageInfo } = normalizeResponse(response);
  const tests = items;

  if (!tests.length) {
    return "No tests found.";
  }

  const count = tests.length;
  const lines: string[] = [];
  lines.push(`Found ${count} test${pluralize(count)}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  tests.forEach((test, index) => {
    lines.push("");
    lines.push(formatTest(test, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatTest(test: VantaTest, index: number): string {
  const parts: string[] = [];
  parts.push(`Test #${index}`);
  parts.push(
    ...[
      addField("Name", test.name),
      addField("ID", test.id),
      addField("Status", test.status),
      addField("Category", test.category),
      addTextField("Description", test.description),
      addTextField("Failure Info", test.failureDescription),
      addTextField("Remediation", test.remediationDescription),
      addArrayField("Integrations", test.integrations),
      addOwnerField(test.owner),
    ].filter((x): x is string => x !== null)
  );

  if (test.deactivatedStatusInfo?.isDeactivated) {
    const reason =
      test.deactivatedStatusInfo.deactivatedReason ?? "No reason provided";
    parts.push(`Deactivated: Yes (${reason})`);
    const deactivatedDate = addDateField(
      "Deactivated Last Updated",
      test.deactivatedStatusInfo.lastUpdatedDate
    );
    if (deactivatedDate) {
      parts.push(deactivatedDate);
    }
  }

  if (
    test.remediationStatusInfo?.status &&
    test.remediationStatusInfo.status !== "PASS" &&
    test.remediationStatusInfo.status !== "DISABLED"
  ) {
    const count = test.remediationStatusInfo.itemCount ?? 0;
    parts.push(
      `Remediation Status: ${test.remediationStatusInfo.status} (${count} items)`
    );
    const remediateByDate = addDateField(
      "Soonest Remediate By",
      test.remediationStatusInfo.soonestRemediateByDate
    );
    if (remediateByDate) {
      parts.push(remediateByDate);
    }
  }

  parts.push(
    ...[
      addDateField("Last Run", test.lastTestRunDate),
      addDateField("Latest Flip Date", test.latestFlipDate),
    ].filter((x): x is string => x !== null)
  );
  if (test.version) {
    parts.push(
      `Version: ${test.version.major}.${test.version.minor} (${test.version._id})`
    );
  }
  return parts.join("\n");
}

function formatOwner(owner: z.infer<typeof VantaOwnerSchema>): string | null {
  if (!owner) {
    return null;
  }
  if (typeof owner === "string") {
    return owner;
  }
  return owner.displayName ?? owner.emailAddress ?? owner.id ?? null;
}

function cleanText(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  return text
    .replace(/\[([^\]]+)\]\(\/policies\/[^)]+\)/g, '"$1" policy (in Vanta)')
    .replace(/\[([^\]]+)\]\(\/documents\/[^)]+\)/g, '"$1" document (in Vanta)')
    .replace(/\[([^\]]+)\]\(\/people[^)]*\)/g, '"$1" page (in Vanta)')
    .replace(
      /\[([^\]]+)\]\(\/integrations[^)]*\)/g,
      '"$1" integration (in Vanta)'
    )
    .replace(/\[([^\]]+)\]\(\/controls[^)]*\)/g, '"$1" control (in Vanta)')
    .replace(/\[([^\]]+)\]\(\/tests[^)]*\)/g, '"$1" test (in Vanta)')
    .replace(/\[([^\]]+)\]\(\/frameworks[^)]*\)/g, '"$1" framework (in Vanta)')
    .replace(/\[([^\]]+)\]\(\/[^)]+\)/g, '"$1" (in Vanta)')
    .replace(/\s+\/policies\/\S+/g, " (see Vanta policies)")
    .replace(/\s+\/documents\/\S+/g, " (see Vanta documents)")
    .replace(/\s+\/people\S*/g, " (see Vanta people page)");
}

function formatDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) {
    return null;
  }
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function addField(label: string, value: unknown): string | null {
  if (value != null && value !== "") {
    return `${label}: ${value}`;
  }
  return null;
}

function addRequiredField(label: string, value: unknown): string | null {
  if (value !== null && value !== undefined && value !== "") {
    return `${label}: ${value}`;
  }
  return null;
}

function addTextField(
  label: string,
  value: string | null | undefined
): string | null {
  if (value) {
    return `${label}: ${cleanText(value)}`;
  }
  return null;
}

function addDateField(
  label: string,
  value: string | null | undefined
): string | null {
  if (value) {
    return `${label}: ${formatDate(value)}`;
  }
  return null;
}

function addBooleanField(
  label: string,
  value: boolean | null | undefined
): string | null {
  if (value != null) {
    return `${label}: ${value ? "Yes" : "No"}`;
  }
  return null;
}

function addArrayField(
  label: string,
  value: unknown[] | null | undefined,
  separator = ", "
): string | null {
  if (value?.length) {
    return `${label}: ${value.join(separator)}`;
  }
  return null;
}

function addOwnerField(
  owner: z.infer<typeof VantaOwnerSchema> | null | undefined
): string | null {
  if (owner) {
    const ownerName = formatOwner(owner);
    if (ownerName) {
      return `Owner: ${ownerName}`;
    }
  }
  return null;
}

export function renderTestEntities(
  response: VantaTestEntitiesResponse
): string {
  const { items, pageInfo } = normalizeResponse(response);
  const entities = items;

  if (!entities.length) {
    return "No test entities found for this test.";
  }

  const count = entities.length;
  const lines: string[] = [];
  lines.push(`Found ${count} entit${count === 1 ? "y" : "ies"}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  entities.forEach((entity, index) => {
    lines.push("");
    lines.push(formatTestEntity(entity, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatTestEntity(entity: VantaTestEntity, index: number): string {
  const parts: string[] = [];
  parts.push(`Entity #${index}`);
  parts.push(
    ...[
      addRequiredField("ID", entity.id),
      addRequiredField("Name", entity.displayName),
      addRequiredField("Entity Status", entity.entityStatus),
      addRequiredField("Response Type", entity.responseType),
      addField("Deactivated Reason", entity.deactivatedReason),
      addRequiredField("Created", formatDate(entity.createdDate)),
      addRequiredField("Last Updated", formatDate(entity.lastUpdatedDate)),
    ].filter((x): x is string => x !== null)
  );
  return parts.join("\n");
}

export function renderControls(response: VantaControlsResponse): string {
  const { items, pageInfo } = normalizeResponse(response);
  const controls = items;

  if (!controls.length) {
    return "No controls found.";
  }

  const count = controls.length;
  const lines: string[] = [];
  lines.push(`Found ${count} control${pluralize(count)}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  controls.forEach((control, index) => {
    lines.push("");
    lines.push(formatControl(control, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatControl(control: VantaControl, index: number): string {
  const parts: string[] = [];
  parts.push(`Control #${index}`);
  parts.push(
    ...[
      addField("Name", control.name),
      addField("ID", control.id),
      addField("External ID", control.externalId),
      addField("Source", control.source),
      addArrayField("Domains", control.domains),
      addField("Role", control.role),
      addTextField("Description", control.description),
      addOwnerField(control.owner),
    ].filter((x): x is string => x !== null)
  );
  if (control.customFields?.length) {
    parts.push("Custom Fields:");
    control.customFields.forEach((field) => {
      parts.push(`  ${field.label}: ${String(field.value)}`);
    });
  }
  return parts.join("\n");
}

export function renderDocuments(response: VantaDocumentsResponse): string {
  const { items, pageInfo } = normalizeResponse(response);
  const documents = items;

  if (!documents.length) {
    return "No documents found.";
  }

  const count = documents.length;
  const lines: string[] = [];
  lines.push(`Found ${count} document${pluralize(count)}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  documents.forEach((doc, index) => {
    lines.push("");
    lines.push(formatDocument(doc, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatDocument(doc: VantaDocument, index: number): string {
  const parts: string[] = [];
  parts.push(`Document #${index}`);
  parts.push(
    ...[
      addField("Title", doc.title),
      addField("ID", doc.id),
      addField("Status", doc.uploadStatus),
      addField("Category", doc.category),
      addBooleanField("Sensitive", doc.isSensitive),
      addField("Owner ID", doc.ownerId),
      addTextField("Description", doc.description),
      addField("URL", doc.url),
      addDateField("Upload Status Date", doc.uploadStatusDate),
    ].filter((x): x is string => x !== null)
  );
  return parts.join("\n");
}

export function renderIntegrations(
  response: VantaIntegrationsResponse
): string {
  const { items, pageInfo } = normalizeResponse(response);
  const integrations = items;

  if (!integrations.length) {
    return "No integrations found.";
  }

  const count = integrations.length;
  const lines: string[] = [];
  lines.push(`Found ${count} integration${pluralize(count)}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  integrations.forEach((integration, index) => {
    lines.push("");
    lines.push(formatIntegration(integration, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatIntegration(
  integration: VantaIntegration,
  index: number
): string {
  const parts: string[] = [];
  parts.push(`Integration #${index}`);
  parts.push(
    ...[
      addRequiredField("ID", integration.integrationId),
      addRequiredField("Name", integration.displayName),
      addArrayField("Resource Kinds", integration.resourceKinds),
    ].filter((x): x is string => x !== null)
  );
  if (integration.connections?.length) {
    parts.push(`Connections: ${integration.connections.length}`);
    integration.connections.forEach((conn, idx) => {
      parts.push(
        `  Connection ${idx + 1}: ${conn.connectionId} (Disabled: ${conn.isDisabled ? "Yes" : "No"})`
      );
      if (conn.connectionErrorMessage) {
        parts.push(`    Error: ${conn.connectionErrorMessage}`);
      }
    });
  }
  return parts.join("\n");
}

export function renderFrameworks(response: VantaFrameworksResponse): string {
  const { items, pageInfo } = normalizeResponse(response);
  const frameworks = items;

  if (!frameworks.length) {
    return "No frameworks found.";
  }

  const count = frameworks.length;
  const lines: string[] = [];
  lines.push(`Found ${count} framework${pluralize(count)}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  frameworks.forEach((framework, index) => {
    lines.push("");
    lines.push(formatFramework(framework, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatFramework(framework: VantaFramework, index: number): string {
  const parts: string[] = [];
  parts.push(`Framework #${index}`);
  parts.push(
    ...[
      addField("Name", framework.name),
      addField("ID", framework.id),
      addField("Status", framework.status),
      addField("Controls", framework.controlCount),
      addField("Description", framework.description),
    ].filter((x): x is string => x !== null)
  );
  if (framework.completionPercentage != null) {
    parts.push(`Completion: ${framework.completionPercentage}%`);
  }
  return parts.join("\n");
}

export function renderPeople(response: VantaPeopleResponse): string {
  const { items, pageInfo } = normalizeResponse(response);
  const people = items;

  if (!people.length) {
    return "No people found.";
  }

  const count = people.length;
  const lines: string[] = [];
  lines.push(`Found ${count} ${count === 1 ? "person" : "people"}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  people.forEach((person, index) => {
    lines.push("");
    lines.push(formatPerson(person, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatPerson(person: VantaPerson, index: number): string {
  const parts: string[] = [];
  parts.push(`Person #${index}`);
  const idField = addRequiredField("ID", person.id);
  if (idField) {
    parts.push(idField);
  }
  if (person.name) {
    parts.push(`Name: ${person.name.display}`);
    parts.push(
      ...[
        addField("First Name", person.name.first),
        addField("Last Name", person.name.last),
      ].filter((x): x is string => x !== null)
    );
  }
  parts.push(
    ...[
      addField("Email", person.emailAddress),
      addArrayField("Group IDs", person.groupIds),
    ].filter((x): x is string => x !== null)
  );
  if (person.employment) {
    parts.push(
      ...[
        addField("Employment Status", person.employment.status),
        addField("Job Title", person.employment.jobTitle),
        addDateField("Start Date", person.employment.startDate),
        addDateField("End Date", person.employment.endDate),
      ].filter((x): x is string => x !== null)
    );
  }
  if (person.leaveInfo) {
    parts.push(`Leave Info: ${JSON.stringify(person.leaveInfo)}`);
  }
  if (person.sources && Object.keys(person.sources).length > 0) {
    parts.push(`Sources: ${JSON.stringify(person.sources)}`);
  }
  if (person.tasksSummary && Object.keys(person.tasksSummary).length > 0) {
    parts.push(`Tasks Summary: ${JSON.stringify(person.tasksSummary)}`);
  }
  return parts.join("\n");
}

export function renderRisks(response: VantaRisksResponse): string {
  const { items, pageInfo } = normalizeResponse(response);
  const risks = items;

  if (!risks.length) {
    return "No risks found.";
  }

  const count = risks.length;
  const lines: string[] = [];
  lines.push(`Found ${count} risk${pluralize(count)}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  risks.forEach((risk, index) => {
    lines.push("");
    lines.push(formatRisk(risk, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatRisk(risk: VantaRisk, index: number): string {
  const parts: string[] = [];
  parts.push(`Risk #${index}`);
  parts.push(
    ...[
      addRequiredField("Risk ID", risk.riskId),
      addArrayField("Categories", risk.categories),
      addTextField("Description", risk.description),
      addField("Review Status", risk.reviewStatus),
      addField("Likelihood", risk.likelihood),
      addField("Impact", risk.impact),
      addField("Treatment", risk.treatment),
      addField("Owner", risk.owner),
      addField("Residual Likelihood", risk.residualLikelihood),
      addField("Residual Impact", risk.residualImpact),
      addArrayField("CIA Categories", risk.ciaCategories),
      addTextField("Note", risk.note),
      addField("Risk Register", risk.riskRegister),
      addBooleanField("Archived", risk.isArchived),
      addArrayField("Required Approvers", risk.requiredApprovers),
    ].filter((x): x is string => x !== null)
  );
  if (risk.customFields?.length) {
    parts.push("Custom Fields:");
    risk.customFields.forEach((field) => {
      parts.push(`  ${field.label}: ${String(field.value)}`);
    });
  }
  return parts.join("\n");
}

export function renderVulnerabilities(
  response: VantaVulnerabilitiesResponse
): string {
  const { items, pageInfo } = normalizeResponse(response);
  const vulnerabilities = items;

  if (!vulnerabilities.length) {
    return "No vulnerabilities found.";
  }

  const count = vulnerabilities.length;
  const lines: string[] = [];
  lines.push(`Found ${count} vulnerabilit${count === 1 ? "y" : "ies"}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  vulnerabilities.forEach((vuln, index) => {
    lines.push("");
    lines.push(formatVulnerability(vuln, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatVulnerability(vuln: VantaVulnerability, index: number): string {
  const parts: string[] = [];
  parts.push(`Vulnerability #${index}`);
  parts.push(
    ...[
      addRequiredField("ID", vuln.id),
      addRequiredField("Name", vuln.name),
      addRequiredField("Description", cleanText(vuln.description)),
      addRequiredField("Severity", vuln.severity),
      addRequiredField("Type", vuln.vulnerabilityType),
      addRequiredField("Integration ID", vuln.integrationId),
      addRequiredField("Target ID", vuln.targetId),
      addField("Package", vuln.packageIdentifier),
      addField("CVSS Score", vuln.cvssSeverityScore),
      addField("Scanner Score", vuln.scannerScore),
      addBooleanField("Fixable", vuln.isFixable),
      addDateField("Remediate By", vuln.remediateByDate),
      addRequiredField("First Detected", formatDate(vuln.firstDetectedDate)),
      addDateField("Source Detected", vuln.sourceDetectedDate),
      addDateField("Last Detected", vuln.lastDetectedDate),
      addField("Scan Source", vuln.scanSource),
      addField("External URL", vuln.externalURL),
      addArrayField("Related Vulnerabilities", vuln.relatedVulns),
      addArrayField("Related URLs", vuln.relatedUrls),
    ].filter((x): x is string => x !== null)
  );
  if (vuln.deactivateMetadata) {
    parts.push(`Deactivated: Yes`);
    const deactivatedAt = addDateField(
      "Deactivated At",
      vuln.deactivateMetadata.deactivatedAt
    );
    if (deactivatedAt) {
      parts.push(deactivatedAt);
    }
    parts.push(
      ...[
        addField("Deactivated By", vuln.deactivateMetadata.deactivatedBy),
        addField(
          "Deactivation Reason",
          vuln.deactivateMetadata.deactivationReason
        ),
      ].filter((x): x is string => x !== null)
    );
  }
  return parts.join("\n");
}

export function renderDocumentResources(
  response: VantaDocumentResourcesResponse,
  resourceType: string
): string {
  const { items, pageInfo } = normalizeResponse(response);
  const resources = items;

  if (!resources.length) {
    return `No ${resourceType} found for this document.`;
  }

  const count = resources.length;
  const lines: string[] = [];
  lines.push(`Found ${count} ${resourceType}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  resources.forEach((resource, index) => {
    lines.push("");
    lines.push(formatDocumentResource(resource, index + 1, resourceType));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatDocumentResource(
  resource: VantaDocumentResource,
  index: number,
  resourceType: string
): string {
  const parts: string[] = [];
  const label = resourceType.slice(0, -1);
  parts.push(`${label.charAt(0).toUpperCase() + label.slice(1)} #${index}`);
  parts.push(
    ...[
      addField("ID", resource.id),
      addField("Name", resource.name),
      addField("Type", resource.type),
      addField("URL", resource.url),
      addField("Description", resource.description),
    ].filter((x): x is string => x !== null)
  );
  return parts.join("\n");
}

export function renderIntegrationResources(
  response: VantaIntegrationResourcesResponse
): string {
  let items: VantaIntegrationResource[];
  let pageInfo: z.infer<typeof PageInfoSchema> | null;

  if (Array.isArray(response)) {
    items = response;
    pageInfo = null;
  } else if (
    typeof response === "object" &&
    response !== null &&
    "results" in response
  ) {
    const results = response.results as {
      pageInfo: z.infer<typeof PageInfoSchema>;
      data: VantaIntegrationResource[];
    };
    items = results.data;
    pageInfo = results.pageInfo;
  } else if (
    typeof response === "object" &&
    response !== null &&
    "data" in response
  ) {
    items = [response.data as VantaIntegrationResource];
    pageInfo = null;
  } else {
    items = [response as VantaIntegrationResource];
    pageInfo = null;
  }

  if (!items.length) {
    return "No integration resources found.";
  }

  const count = items.length;
  const lines: string[] = [];
  lines.push(`Found ${count} resource${pluralize(count)}`);

  if (pageInfo?.endCursor) {
    lines.push(`Next page cursor: ${pageInfo.endCursor}`);
  }

  lines.push("\n---");

  items.forEach((resource, index) => {
    lines.push("");
    lines.push(formatIntegrationResource(resource, index + 1));
    lines.push("\n---");
  });

  return lines.join("\n").trim();
}

function formatIntegrationResource(
  resource: VantaIntegrationResource,
  index: number
): string {
  const parts: string[] = [];
  parts.push(`Resource #${index}`);
  parts.push(
    ...[
      addRequiredField("ID", resource.id),
      addRequiredField("Name", resource.displayName),
      addRequiredField("Kind", resource.kind),
      addBooleanField("In Scope", resource.inScope),
      addField("Account", resource.account),
      addField("Region", resource.region),
      addField("Owner", resource.owner),
      addField("Description", resource.description),
      addDateField("Created", resource.createdDate),
    ].filter((x): x is string => x !== null)
  );
  return parts.join("\n");
}
