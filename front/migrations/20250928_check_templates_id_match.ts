import assert from "assert";
import { Op } from "sequelize";

import { config } from "@app/lib/api/regions/config";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { frontSequelize } from "@app/lib/resources/storage";
import { TemplateModel } from "@app/lib/resources/storage/models/templates";
import { TemplateResource } from "@app/lib/resources/template_resource";
import type { Logger } from "@app/logger/logger";
import type {
  AssistantTemplateListType,
  FetchAssistantTemplatesResponse,
} from "@app/pages/api/templates";
import { makeScript } from "@app/scripts/helpers";

async function computeTemplateIdMatches({
  logger,
}: {
  logger: Logger;
}): Promise<
  {
    localTemplate: TemplateResource | null;
    remoteTemplate: AssistantTemplateListType;
  }[]
> {
  if (!config.getDustRegionSyncEnabled()) {
    logger.info("Region sync not enabled, skipping template ID check");
    return [];
  }

  const localTemplates = await TemplateResource.listAll();
  logger.info(`Found ${localTemplates.length} local templates`);

  const mainRegionUrl = config.getDustRegionSyncMasterUrl();

  const response = await fetch(`${mainRegionUrl}/api/templates`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch templates from main region: ${response.status}`
    );
  }

  const { templates: remoteTemplates }: FetchAssistantTemplatesResponse =
    await response.json();
  logger.info(`Found ${remoteTemplates.length} remote templates`);

  const localTemplatesByHandle = new Map<string, TemplateResource>();
  for (const template of localTemplates) {
    localTemplatesByHandle.set(template.handle, template);
  }

  const mismatches = [];
  for (const remoteTemplate of remoteTemplates) {
    const localTemplate = localTemplatesByHandle.get(remoteTemplate.handle);
    if (localTemplate) {
      if (localTemplate.id !== remoteTemplate.id) {
        logger.info(
          {
            handle: localTemplate.handle,
            localId: localTemplate.id,
            remoteId: remoteTemplate.id,
          },
          "Template ID mismatch"
        );
        mismatches.push({
          localTemplate,
          remoteTemplate,
        });
      }
    } else {
      logger.info(
        {
          handle: remoteTemplate.handle,
          remoteId: remoteTemplate.id,
        },
        "Template not found locally"
      );
      mismatches.push({
        localTemplate: null,
        remoteTemplate,
      });
    }
  }

  return mismatches;
}

async function fixTemplateMismatch(
  mismatch: {
    localTemplate: TemplateResource | null;
    remoteTemplate: AssistantTemplateListType;
  },
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<void> {
  const { localTemplate, remoteTemplate } = mismatch;

  if (!localTemplate) {
    logger.warn(
      {
        handle: remoteTemplate.handle,
        remoteId: remoteTemplate.id,
      },
      "Template not found locally, please run a pull before proceeding"
    );
    return;
  }

  logger.info(
    {
      handle: localTemplate.handle,
      localId: localTemplate.id,
      remoteId: remoteTemplate.id,
    },
    "Fixing template ID mismatch"
  );

  // 1. We abort if there is no template with a higher id than the one we want to create.
  // Since we don't bump the sequence, this prevents creating a template with an id that
  // could be taken by a future template (although should not happen because of sharding).
  const templatesWithHigherId = await TemplateModel.findAll({
    where: {
      id: { [Op.gt]: remoteTemplate.id },
    },
  });
  if (templatesWithHigherId.length === 0) {
    logger.error("No templates with higher id found, aborting.");
  }

  // 2. We abort if the id we want to create is already taken by another template.
  const templateWithSameId = await TemplateModel.findOne({
    where: { id: remoteTemplate.id },
  });
  if (templateWithSameId) {
    logger.error("Template ID already taken, aborting.");
  }

  // 3. We fetch the template from the main region and create a new template with the correct id.
  // We move the FK from existing agent configurations to the new template's id.
  if (execute) {
    const affectedAgentConfigurations = await frontSequelize.transaction(
      async (t) => {
        const templateCopy = await TemplateResource.makeNew(
          { ...localTemplate, id: remoteTemplate.id },
          { transaction: t }
        );
        assert(templateCopy.id === remoteTemplate.id);

        const [affectedCount] = await AgentConfiguration.update(
          {
            templateId: templateCopy.id,
          },
          {
            where: { templateId: localTemplate.id },
            transaction: t,
          }
        );
        await localTemplate.model.destroy({ transaction: t });

        return affectedCount;
      }
    );
    logger.info(
      {
        handle: localTemplate.handle,
        oldId: localTemplate.id,
        newId: remoteTemplate.id,
        affectedAgentConfigurations,
      },
      "Successfully fixed template ID mismatch"
    );
  } else {
    const affectedAgentConfigurations = await AgentConfiguration.findAll({
      where: { templateId: localTemplate.id },
    });
    logger.info(
      {
        handle: localTemplate.handle,
        oldId: localTemplate.id,
        newId: remoteTemplate.id,
        affectedAgentConfigurations: affectedAgentConfigurations.length,
      },
      "Would fix template ID mismatch"
    );
  }
}

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting template ID match check");

  const mismatches = await computeTemplateIdMatches({ logger });

  if (mismatches.length === 0) {
    logger.info("No template ID mismatches found");
    return;
  }

  if (mismatches.some(({ localTemplate }) => localTemplate === null)) {
    logger.warn(
      "Some templates are not found locally, please run a pull before proceeding"
    );
    return;
  }

  logger.info(`Found ${mismatches.length} template ID mismatches`);

  for (const mismatch of mismatches) {
    await fixTemplateMismatch(mismatch, { execute, logger });
  }

  logger.info("Template ID match check completed");
});
