/* eslint-disable dust/no-raw-sql */

import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import { writeFileSync } from "fs";
import { QueryTypes } from "sequelize";

import { getWorkOS } from "@app/lib/api/workos/client";
import { frontSequelize } from "@app/lib/resources/storage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    file: {
      alias: "f",
      describe: "If provided, file to save the found domains to",
    },
  },
  async ({ execute, file }, logger) => {
    const domains = await frontSequelize.query<{
      sId: string;
      name: string;
      domain: string;
      workOSOrganizationId: string;
    }>(
      `
SELECT
  w."sId",
  w.name,
  ws.domain,
  w."workOSOrganizationId"
FROM
  workspace_has_domains ws,
  workspaces w
  LEFT OUTER JOIN subscriptions s ON s."workspaceId" = w.id
WHERE
  w.id = ws."workspaceId"
  AND ws."domainAutoJoinEnabled" = FALSE
  AND s.id IS NULL
  AND w."workOSOrganizationId" IS NOT NULL
`,
      { type: QueryTypes.SELECT }
    );

    logger.info(`${domains.length} found`);

    const records: Record<string, any>[] = [];

    const workOS = getWorkOS();

    if (execute) {
      logger.info("Will execute");
    }

    for (const domain of domains) {
      const domainRecord: Record<string, any> = domain;

      try {
        if (execute) {
          // Remove the domain data.
          await workOS.organizations.updateOrganization({
            organization: domain.workOSOrganizationId,
            domainData: [],
            metadata: {
              // Add a metadata to trigger the webhook.
              cleanDomain: format(new Date(), "PPP"),
            },
          });

          // Fetch all organization memberships.
          const memberships =
            await workOS.userManagement.listOrganizationMemberships({
              organizationId: domain.workOSOrganizationId,
            });

          domainRecord.memberships = memberships.data.length;

          // Remove all.
          await concurrentExecutor(
            memberships.data,
            async (membership) =>
              workOS.userManagement.deleteOrganizationMembership(membership.id),
            { concurrency: 10 }
          );
        } else {
          // If we don't execute, we still want to get some information
          await workOS.organizations.getOrganization(
            domain.workOSOrganizationId
          );

          const memberships =
            await workOS.userManagement.listOrganizationMemberships({
              organizationId: domain.workOSOrganizationId,
            });
          domainRecord.memberships = memberships.data.length;
        }
      } catch (err) {
        domainRecord.missingOrg = true;
      }

      records.push(domainRecord);
    }

    if (file) {
      writeFileSync(file, stringify(records));
      logger.info(`File saved`);
    }
  }
);
