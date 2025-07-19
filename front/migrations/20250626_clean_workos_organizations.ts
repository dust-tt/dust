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
SELECT DISTINCT
  w."sId",
  w.name,
  ws.domain,
  w."workOSOrganizationId"
FROM
  workspaces w
  JOIN workspace_has_domains ws ON w."id" = ws."workspaceId"
  LEFT JOIN subscriptions s ON w."id" = s."workspaceId"
WHERE
  ws."domainAutoJoinEnabled" = FALSE
  AND w."workOSOrganizationId" IS NOT NULL
  AND NOT EXISTS ( -- Ensure there are no active subscriptions
    SELECT
      1
    FROM
      "subscriptions" "s2"
    WHERE
      "s2"."workspaceId" = "w"."id"
      AND "s2"."endDate" IS NULL
  )
  AND (
    "s"."id" IS NULL -- Include workspaces with no subscriptions
    OR "s"."endDate" < NOW() - INTERVAL '1 month' -- Or subscriptions that ended more than a month ago
    OR (
      "s"."endDate" IS NOT NULL
      AND "s"."endDate" < NOW() - INTERVAL '1 month' -- Redundant check for clarity
    )
  );
`,
      { type: QueryTypes.SELECT }
    );

    logger.info(`${domains.length} found`);

    const workOS = getWorkOS();

    if (execute) {
      logger.info("Will execute");
    }

    const records = await concurrentExecutor(
      domains,
      async (domain) => {
        const domainRecord: Record<string, any> = domain;

        try {
          if (execute) {
            // Remove the domain data.
            await workOS.organizations.updateOrganization({
              organization: domain.workOSOrganizationId,
              domainData: [],
            });
            // Add a second update, for a weird reason doing both doesn't work
            await workOS.organizations.updateOrganization({
              organization: domain.workOSOrganizationId,
              metadata: {
                // Add a metadata to trigger the webhook.
                cleanDomain: format(new Date(), "PPP"),
              },
            });

            // Fetch all organization memberships.
            const memberships =
              await workOS.userManagement.listOrganizationMemberships({
                organizationId: domain.workOSOrganizationId,
                limit: 100,
              });

            domainRecord.memberships = memberships.data.length;

            // Remove all.
            await concurrentExecutor(
              memberships.data,
              async (membership) =>
                workOS.userManagement.deleteOrganizationMembership(
                  membership.id
                ),
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
                limit: 100,
              });
            domainRecord.memberships = memberships.data.length;
          }
        } catch (err) {
          domainRecord.missingOrg = true;
        }

        return domainRecord;
      },
      {
        concurrency: 5,
      }
    );

    if (file) {
      writeFileSync(file, stringify(records));
      logger.info(`File saved`);
    }
  }
);
