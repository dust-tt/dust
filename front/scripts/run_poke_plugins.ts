import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { fetchPluginResource } from "@app/lib/api/poke/utils";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { SupportedResourceType } from "@app/types";
import { supportedResourceTypes } from "@app/types";

makeScript(
  {
    list: {
      type: "boolean",
      describe: "List all available plugins",
      default: false,
    },
    plugin: {
      type: "string",
      describe: "Plugin ID to run",
    },
    resourceType: {
      type: "string",
      describe: "Resource type (required when running a plugin)",
    },
    resourceId: {
      type: "string",
      describe: "Specific resource ID (optional)",
    },
    wId: {
      type: "string",
      describe: "Workspace ID (required for workspace-scoped plugins)",
    },
    args: {
      type: "string",
      describe: "Plugin arguments as JSON string",
    },
  },
  async (args, logger) => {
    const {
      list,
      plugin: pluginId,
      resourceType,
      resourceId,
      wId: workspaceId,
      args: pluginArgs,
      execute,
    } = args;

    // List all plugins
    if (list) {
      const allPlugins = supportedResourceTypes.flatMap((rt) =>
        pluginManager.getPluginsForResourceType(rt).map((p) => ({
          id: p.manifest.id,
          name: p.manifest.name,
          description: p.manifest.description,
          resourceType: rt,
        }))
      );

      console.log(`Found ${allPlugins.length} plugins:`);
      allPlugins.forEach((plugin) => {
        console.log(`  ${plugin.id} (${plugin.resourceType})`);
        console.log(`    Name: ${plugin.name}`);
        console.log(`    Description: ${plugin.description}`);
        console.log();
      });
      return;
    }

    // Run a specific plugin
    if (pluginId) {
      if (!resourceType) {
        logger.error("--resource-type is required when running a plugin");
        return;
      }

      if (
        !supportedResourceTypes.includes(resourceType as SupportedResourceType)
      ) {
        logger.error(`Invalid resource type: ${resourceType}`);
        logger.info(`Supported types: ${supportedResourceTypes.join(", ")}`);
        return;
      }

      const plugin = pluginManager.getPluginById(pluginId);
      if (!plugin) {
        logger.error(`Plugin not found: ${pluginId}`);
        return;
      }

      // Parse plugin arguments
      let parsedArgs = {};
      if (pluginArgs) {
        try {
          parsedArgs = JSON.parse(pluginArgs);
        } catch (e) {
          logger.error(`Invalid JSON in --args: ${e}`);
          return;
        }
      }

      // Set up authentication
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        logger.error(`Workspace not found: ${workspaceId}`);
        return;
      }
      const auth = await Authenticator.internalAdminForWorkspace(
        workspace.sId,
        {
          dangerouslyRequestAllGroups: true,
        }
      );

      // Fetch the resource if specified
      let resource = null;
      if (resourceId) {
        try {
          resource = await fetchPluginResource(
            auth,
            resourceType as SupportedResourceType,
            resourceId
          );
        } catch (e) {
          logger.error(`Failed to fetch resource ${resourceId}: ${e}`);
          return;
        }
      }

      // Check if plugin is applicable
      if (!plugin.isApplicableTo(auth, resource)) {
        logger.error(
          `Plugin ${pluginId} is not applicable to the specified resource`
        );
        return;
      }

      logger.info(`Running plugin: ${plugin.manifest.name}`);
      logger.info(`Arguments: ${JSON.stringify(parsedArgs, null, 2)}`);

      if (!execute) {
        logger.warn("Dry run mode - use --execute to actually run the plugin");
        return;
      }

      try {
        const result = await plugin.execute(auth, resource, parsedArgs);

        if (result.isErr()) {
          logger.error(`Plugin execution failed: ${result.error.message}`);
          return;
        }

        logger.info("Plugin execution successful!");
        console.log("\n=== PLUGIN RESULT ===");

        const response = result.value;
        switch (response.display) {
          case "text":
            console.log(response.value);
            break;
          case "markdown":
            console.log(response.value);
            break;
          case "json":
            console.log(JSON.stringify(response.value, null, 2));
            break;
          case "textWithLink":
            console.log(response.value);
            console.log(`Link: ${response.link} (${response.linkText})`);
            break;
        }
        console.log("=== END RESULT ===\n");
      } catch (e) {
        logger.error(`Plugin execution error: ${e}`);
        return;
      }

      return;
    }

    // Show help
    logger.info("Poke Plugin Runner");
    logger.info("Usage:");
    logger.info("  --list                     List all available plugins");
    logger.info("  --plugin ID                Run a specific plugin");
    logger.info(
      "  --resource-type TYPE       Resource type (required for plugin execution)"
    );
    logger.info("  --resource-id ID           Specific resource ID (optional)");
    logger.info(
      "  --workspace-id ID          Workspace ID (required for workspace-scoped plugins)"
    );
    logger.info("  --args JSON                Plugin arguments as JSON string");
    logger.info(
      "  --execute                  Actually run the plugin (default: dry run)"
    );
    logger.info(
      `\nSupported resource types: ${supportedResourceTypes.join(", ")}`
    );
  }
);
