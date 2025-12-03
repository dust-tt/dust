import { pluralize } from "@app/types";

export interface VantaTestsResponse {
  results: {
    pageInfo: {
      totalCount: number;
      endCursor: string | null;
    };
    data: VantaTest[];
  };
}

interface VantaTest {
  id: string;
  name: string;
  status: string;
  category: string;
  description?: string;
  failureDescription?: string;
  remediationDescription?: string;
  lastTestRunDate?: string;
  integrations?: VantaIntegration[];
  owner?: VantaOwner;
  deactivatedStatusInfo?: {
    isDeactivated: boolean;
    deactivatedReason?: string;
  };
  remediationStatusInfo?: {
    status: string;
    itemCount?: number;
  };
}

interface VantaIntegration {
  id: string;
  name?: string;
}

interface VantaOwner {
  id: string;
  displayName?: string;
  emailAddress?: string;
}

export function renderTests(response: VantaTestsResponse): string {
  const { results } = response;
  const tests = results.data;
  const { totalCount, endCursor } = results.pageInfo;

  if (!tests.length) {
    return "No tests found.";
  }

  const lines: string[] = [];
  lines.push(`Found ${totalCount} test${pluralize(totalCount)}`);

  if (endCursor) {
    lines.push(`Next page cursor: ${endCursor}`);
  }

  lines.push("");
  lines.push("---");

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
  parts.push(`Name: ${test.name}`);
  parts.push(`ID: ${test.id}`);
  parts.push(`Status: ${test.status}`);
  parts.push(`Category: ${test.category}`);

  if (test.description) {
    parts.push(`Description: ${cleanText(test.description)}`);
  }

  if (test.failureDescription) {
    parts.push(`Failure Info: ${cleanText(test.failureDescription)}`);
  }

  if (test.remediationDescription) {
    parts.push(`Remediation: ${cleanText(test.remediationDescription)}`);
  }

  if (test.integrations?.length) {
    parts.push(
      `Integrations: ${test.integrations.map((i) => i.name ?? i.id).join(", ")}`
    );
  }

  if (test.owner) {
    const ownerName =
      test.owner.displayName ?? test.owner.emailAddress ?? test.owner.id;
    parts.push(`Owner: ${ownerName}`);
  }

  if (test.deactivatedStatusInfo?.isDeactivated) {
    const reason =
      test.deactivatedStatusInfo.deactivatedReason ?? "No reason provided";
    parts.push(`Deactivated: Yes (${reason})`);
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
  }

  if (test.lastTestRunDate) {
    parts.push(`Last Run: ${formatDate(test.lastTestRunDate)}`);
  }

  return parts.join("\n");
}

function cleanText(text: string): string {
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

function formatDate(isoDate: string): string {
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
