import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns";
import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";

import { getWorkOS } from "@app/lib/api/workos/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const csvSchema = z.array(
  z.object({
    sId: z.string(),
    name: z.string(),
    domain: z.string(),
    workOSOrganizationId: z.string(),
  })
);

makeScript(
  {
    input: {
      alias: "i",
      type: "string",
      describe:
        "List of workspaces to update. Columns must be sId, name, domain and workOSOrganizationId",
    },
    output: {
      alias: "o",
      type: "string",
      describe: "If provided, file to save the found domains to",
    },
  },
  async ({ execute, input, output }, logger) => {
    if (!input) {
      logger.error("Missing --input args");
      return;
    }

    const inputContent = readFileSync(input, { encoding: "utf8" });
    const parsedInput = parse(inputContent, {
      columns: true,
    });

    const parseResult = csvSchema.safeParse(parsedInput);
    if (!parseResult.success) {
      logger.error({ error: parseResult.error }, "Wrong CSV format");
      return;
    }
    const domains = parseResult.data;

    logger.info(`${domains.length} in the given CSV`);

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
          domainRecord.error = normalizeError(err).message;
        }

        return domainRecord;
      },
      {
        concurrency: 5,
      }
    );

    if (output) {
      writeFileSync(
        output,
        stringify(records, {
          header: true,
        })
      );
      logger.info(`File saved`);
    }
  }
);
