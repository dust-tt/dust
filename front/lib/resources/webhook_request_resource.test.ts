import { describe, expect, it } from "vitest";

import type { WebhookRequestStatus } from "@app/lib/models/assistant/triggers/webhook_request";
import { WebhookRequestModel } from "@app/lib/models/assistant/triggers/webhook_request";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";

describe("WebhookRequestResource", () => {
  describe("getWorkspaceIdsWithTooManyRequests", () => {
    it("should return empty array when no workspaces exceed limits", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 1000,
          webhookRequestTtl: "30 day",
        });

      expect(Array.isArray(result)).toBe(true);
      expect(result).not.toContain(workspace.id);
    });

    it("should return workspaces that exceed max webhook requests limit", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 4 webhook requests (exceeds custom limit of 3)
      const requests: Array<{
        workspaceId: number;
        webhookSourceId: number;
        status: WebhookRequestStatus;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (let i = 0; i < 4; i++) {
        requests.push({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await WebhookRequestModel.bulkCreate(requests);

      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 3,
          webhookRequestTtl: "30 day",
        });

      expect(result).toContain(workspace.id);
    });

    it("should respect the custom maxWebhookRequestsToKeep parameter", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 4 webhook requests
      const requests: Array<{
        workspaceId: number;
        webhookSourceId: number;
        status: WebhookRequestStatus;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (let i = 0; i < 4; i++) {
        requests.push({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await WebhookRequestModel.bulkCreate(requests);

      // With custom limit of 3, this workspace should be returned
      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 3,
          webhookRequestTtl: "30 day",
        });

      expect(result).toContain(workspace.id);
    });

    it("should return workspaces with old requests beyond TTL", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create a webhook request from 40 days ago (beyond 30 day TTL)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      await WebhookRequestModel.create({
        workspaceId: workspace.id,
        webhookSourceId: webhookSource.id,
        status: "received",
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 1000,
          webhookRequestTtl: "30 day",
        });

      expect(result).toContain(workspace.id);
    });

    it("should not return workspaces with old requests within TTL", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create a webhook request from 20 days ago (within 30 day TTL)
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 20);

      await WebhookRequestModel.create({
        workspaceId: workspace.id,
        webhookSourceId: webhookSource.id,
        status: "received",
        createdAt: recentDate,
        updatedAt: recentDate,
      });

      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 1000,
          webhookRequestTtl: "30 day",
        });

      expect(result).not.toContain(workspace.id);
    });

    it("should handle multiple workspaces correctly", async () => {
      const { workspace: workspace1 } = await createResourceTest({
        role: "admin",
      });

      const { workspace: workspace2 } = await createResourceTest({
        role: "admin",
      });

      const { workspace: workspace3 } = await createResourceTest({
        role: "admin",
      });

      // Create webhook sources for each workspace
      const factory1 = new WebhookSourceFactory(workspace1);
      const factory2 = new WebhookSourceFactory(workspace2);
      const factory3 = new WebhookSourceFactory(workspace3);

      const source1Result = await factory1.create({
        name: "Test Webhook Source 1",
      });
      const source2Result = await factory2.create({
        name: "Test Webhook Source 2",
      });
      const source3Result = await factory3.create({
        name: "Test Webhook Source 3",
      });

      if (
        source1Result.isErr() ||
        source2Result.isErr() ||
        source3Result.isErr()
      ) {
        throw new Error("Failed to create webhook sources");
      }

      const webhookSource1 = source1Result.value;
      const webhookSource2 = source2Result.value;
      const webhookSource3 = source3Result.value;

      // Workspace 1: Create 4 requests (exceeds limit of 3)
      const requests1: Array<{
        workspaceId: number;
        webhookSourceId: number;
        status: WebhookRequestStatus;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (let i = 0; i < 4; i++) {
        requests1.push({
          workspaceId: workspace1.id,
          webhookSourceId: webhookSource1.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await WebhookRequestModel.bulkCreate(requests1);

      // Workspace 2: Create 2 requests (within limit of 3)
      const requests2: Array<{
        workspaceId: number;
        webhookSourceId: number;
        status: WebhookRequestStatus;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (let i = 0; i < 2; i++) {
        requests2.push({
          workspaceId: workspace2.id,
          webhookSourceId: webhookSource2.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await WebhookRequestModel.bulkCreate(requests2);

      // Workspace 3: Create 1 old request (beyond TTL)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      await WebhookRequestModel.create({
        workspaceId: workspace3.id,
        webhookSourceId: webhookSource3.id,
        status: "received",
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 3,
          webhookRequestTtl: "30 day",
        });

      // Workspace 1 and 3 should be returned, but not workspace 2
      expect(result).toContain(workspace1.id);
      expect(result).not.toContain(workspace2.id);
      expect(result).toContain(workspace3.id);
    });

    it("should return results sorted by workspaceId ascending", async () => {
      const { workspace: workspace1 } = await createResourceTest({
        role: "admin",
      });

      const { workspace: workspace2 } = await createResourceTest({
        role: "admin",
      });

      // Create webhook sources
      const factory1 = new WebhookSourceFactory(workspace1);
      const factory2 = new WebhookSourceFactory(workspace2);

      const source1Result = await factory1.create({
        name: "Test Webhook Source 1",
      });
      const source2Result = await factory2.create({
        name: "Test Webhook Source 2",
      });

      if (source1Result.isErr() || source2Result.isErr()) {
        throw new Error("Failed to create webhook sources");
      }

      const webhookSource1 = source1Result.value;
      const webhookSource2 = source2Result.value;

      // Create old requests in both workspaces
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);

      await WebhookRequestModel.create({
        workspaceId: workspace1.id,
        webhookSourceId: webhookSource1.id,
        status: "received",
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      await WebhookRequestModel.create({
        workspaceId: workspace2.id,
        webhookSourceId: webhookSource2.id,
        status: "received",
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 1000,
          webhookRequestTtl: "30 day",
        });

      // Filter to only include our test workspaces
      const testResult = result.filter(
        (id) => id === workspace1.id || id === workspace2.id
      );

      // Verify sorted order
      if (testResult.length > 1) {
        for (let i = 0; i < testResult.length - 1; i++) {
          expect(testResult[i]).toBeLessThanOrEqual(testResult[i + 1]);
        }
      }
    });

    it("should handle workspaces with mixed request statuses", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create requests with different statuses
      const statuses: WebhookRequestStatus[] = [
        "received",
        "processed",
        "failed",
      ];
      const requests: Array<{
        workspaceId: number;
        webhookSourceId: number;
        status: WebhookRequestStatus;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      // Create 2 requests
      for (let i = 0; i < 2; i++) {
        requests.push({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: statuses[i % 3],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      // Create 3 more requests for a total of 5
      for (let i = 0; i < 3; i++) {
        requests.push({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: statuses[i % 3],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await WebhookRequestModel.bulkCreate(requests);

      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 3,
          webhookRequestTtl: "30 day",
        });

      // Total of 5 requests, should exceed limit of 3
      expect(result).toContain(workspace.id);
    });

    it("should use default constants when not provided", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 4 requests
      const requests: Array<{
        workspaceId: number;
        webhookSourceId: number;
        status: WebhookRequestStatus;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (let i = 0; i < 4; i++) {
        requests.push({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await WebhookRequestModel.bulkCreate(requests);

      // Call with only the custom maxWebhookRequestsToKeep to test defaults for TTL
      const result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 3,
        });

      expect(result).toContain(workspace.id);
    });

    it("should handle edge case at boundary of max requests", async () => {
      const { workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create exactly 3 requests (at the limit, should NOT be returned)
      const requests: Array<{
        workspaceId: number;
        webhookSourceId: number;
        status: WebhookRequestStatus;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      for (let i = 0; i < 3; i++) {
        requests.push({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await WebhookRequestModel.bulkCreate(requests);

      let result =
        await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
          maxWebhookRequestsToKeep: 3,
          webhookRequestTtl: "30 day",
        });

      // Should not be returned (HAVING COUNT(*) > limit)
      expect(result).not.toContain(workspace.id);

      // Add one more request to exceed limit
      await WebhookRequestModel.create({
        workspaceId: workspace.id,
        webhookSourceId: webhookSource.id,
        status: "received",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      result = await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests({
        maxWebhookRequestsToKeep: 3,
        webhookRequestTtl: "30 day",
      });

      // Should now be returned (4 > 3)
      expect(result).toContain(workspace.id);
    });
  });

  describe("cleanUpWorkspace", () => {
    it("should delete old webhook requests beyond TTL", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create a recent request (should NOT be deleted)
      const recentRequest = await WebhookRequestModel.create({
        workspaceId: workspace.id,
        webhookSourceId: webhookSource.id,
        status: "received",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create an old request from 40 days ago (should be deleted with 30 day TTL)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      await WebhookRequestModel.create({
        workspaceId: workspace.id,
        webhookSourceId: webhookSource.id,
        status: "received",
        createdAt: oldDate,
        updatedAt: oldDate,
      });

      // Verify both requests exist
      let requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(2);

      // Run cleanup
      await WebhookRequestResource.cleanUpWorkspace(authenticator, {
        webhookRequestTtl: "30 day",
        maxWebhookRequestsToKeep: 1000,
      });

      // Verify old request was deleted and recent request remains
      requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].id).toBe(recentRequest.id);
    });

    it("should delete excessive webhook requests beyond max limit", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 5 recent requests with distinct timestamps
      for (let i = 0; i < 5; i++) {
        await WebhookRequestModel.create({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(Date.now() + i * 1000), // Add 1 second between each
          updatedAt: new Date(Date.now() + i * 1000),
        });
      }

      // Verify all 5 requests exist
      let requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
        order: [["createdAt", "ASC"]],
      });
      expect(requests).toHaveLength(5);

      // Run cleanup with max of 2 requests
      await WebhookRequestResource.cleanUpWorkspace(authenticator, {
        webhookRequestTtl: "30 day",
        maxWebhookRequestsToKeep: 2,
      });

      // Verify only 2 most recent requests remain
      requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
        order: [["createdAt", "ASC"]],
      });
      expect(requests).toHaveLength(2);
    });

    it("should handle both old and excessive requests in one cleanup", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 3 old requests
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      for (let i = 0; i < 3; i++) {
        await WebhookRequestModel.create({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: oldDate,
          updatedAt: oldDate,
        });
      }

      // Create 5 recent requests
      const recentIds: number[] = [];
      for (let i = 0; i < 5; i++) {
        const request = await WebhookRequestModel.create({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        recentIds.push(request.id);
      }

      // Verify all 8 requests exist
      let requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(8);

      // Run cleanup with max of 2 requests
      await WebhookRequestResource.cleanUpWorkspace(authenticator, {
        webhookRequestTtl: "30 day",
        maxWebhookRequestsToKeep: 2,
      });

      // Should delete: 3 old requests + 3 excessive recent requests = 6 deleted, 2 remain
      requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(2);
    });

    it("should not delete requests when within limits", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 2 recent requests (within default max of 1000)
      const requestIds: number[] = [];
      for (let i = 0; i < 2; i++) {
        const request = await WebhookRequestModel.create({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        requestIds.push(request.id);
      }

      // Verify 2 requests exist
      let requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(2);

      // Run cleanup with generous limits
      await WebhookRequestResource.cleanUpWorkspace(authenticator, {
        webhookRequestTtl: "30 day",
        maxWebhookRequestsToKeep: 100,
      });

      // Verify no requests were deleted
      requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(2);
      expect(requests.map((r) => r.id).sort()).toEqual(requestIds.sort());
    });

    it("should use default constants when options not provided", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 2 recent requests
      for (let i = 0; i < 2; i++) {
        await WebhookRequestModel.create({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Verify 2 requests exist
      let requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(2);

      // Run cleanup without providing options (should use defaults)
      await WebhookRequestResource.cleanUpWorkspace(authenticator);

      // Verify no requests were deleted (defaults are generous: 1000 limit, 30 day TTL)
      requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(2);
    });

    it("should only delete requests from the specified workspace", async () => {
      const { workspace: workspace1, authenticator: authenticator1 } =
        await createResourceTest({
          role: "admin",
        });

      const { workspace: workspace2 } = await createResourceTest({
        role: "admin",
      });

      // Create webhook sources for both workspaces
      const factory1 = new WebhookSourceFactory(workspace1);
      const factory2 = new WebhookSourceFactory(workspace2);

      const source1Result = await factory1.create({
        name: "Test Webhook Source 1",
      });
      const source2Result = await factory2.create({
        name: "Test Webhook Source 2",
      });

      if (source1Result.isErr() || source2Result.isErr()) {
        throw new Error("Failed to create webhook sources");
      }

      const webhookSource1 = source1Result.value;
      const webhookSource2 = source2Result.value;

      // Create 3 old requests in workspace 1
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      for (let i = 0; i < 3; i++) {
        await WebhookRequestModel.create({
          workspaceId: workspace1.id,
          webhookSourceId: webhookSource1.id,
          status: "received",
          createdAt: oldDate,
          updatedAt: oldDate,
        });
      }

      // Create 3 old requests in workspace 2
      for (let i = 0; i < 3; i++) {
        await WebhookRequestModel.create({
          workspaceId: workspace2.id,
          webhookSourceId: webhookSource2.id,
          status: "received",
          createdAt: oldDate,
          updatedAt: oldDate,
        });
      }

      // Verify both workspaces have 3 old requests
      let requests1 = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace1.id },
      });
      let requests2 = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace2.id },
      });
      expect(requests1).toHaveLength(3);
      expect(requests2).toHaveLength(3);

      // Run cleanup for workspace 1 only
      await WebhookRequestResource.cleanUpWorkspace(authenticator1, {
        webhookRequestTtl: "30 day",
        maxWebhookRequestsToKeep: 1000,
      });

      // Verify workspace 1 requests were deleted but workspace 2 requests remain
      requests1 = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace1.id },
      });
      requests2 = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace2.id },
      });
      expect(requests1).toHaveLength(0);
      expect(requests2).toHaveLength(3);
    });

    it("should handle empty workspace gracefully", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Verify no requests exist
      let requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(0);

      // Run cleanup on empty workspace (should not throw)
      await WebhookRequestResource.cleanUpWorkspace(authenticator, {
        webhookRequestTtl: "30 day",
        maxWebhookRequestsToKeep: 1000,
      });

      // Verify still empty
      requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
      });
      expect(requests).toHaveLength(0);
    });

    it("should delete exactly the oldest requests when exceeding max", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create a webhook source
      const webhookSourceFactory = new WebhookSourceFactory(workspace);
      const webhookSourceResult = await webhookSourceFactory.create({
        name: "Test Webhook Source",
      });

      if (webhookSourceResult.isErr()) {
        throw webhookSourceResult.error;
      }

      const webhookSource = webhookSourceResult.value;

      // Create 5 requests with distinct timestamps in the past
      const creationTimes: Date[] = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date(Date.now() - (5 - i) * 1000); // Create from oldest to newest
        creationTimes.push(date);
        await WebhookRequestModel.create({
          workspaceId: workspace.id,
          webhookSourceId: webhookSource.id,
          status: "received",
          createdAt: date,
          updatedAt: date,
        });
      }

      // Run cleanup with max of 2 requests
      await WebhookRequestResource.cleanUpWorkspace(authenticator, {
        webhookRequestTtl: "30 day",
        maxWebhookRequestsToKeep: 2,
      });

      // Verify only the 2 most recent remain
      const requests = await WebhookRequestModel.findAll({
        where: { workspaceId: workspace.id },
        order: [["createdAt", "ASC"]],
      });
      expect(requests).toHaveLength(2);
      // Verify the remaining requests are the most recent ones
      const remainingTimes = requests.map((r) => r.createdAt.getTime()).sort();
      const newestTimes = creationTimes
        .slice(-2)
        .map((d) => d.getTime())
        .sort();
      expect(remainingTimes).toEqual(newestTimes);
    });
  });
});
