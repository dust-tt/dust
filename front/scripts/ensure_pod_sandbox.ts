import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";

// Operator-only: get or create a pod (project space) and boot its sandbox
// through ensurePodSandboxReady (GCS mounts + pod-state cold start), so the
// pod-state stream can be exercised live with scripts/sandbox_exec.ts without
// going through the product.
makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
    userEmail: {
      type: "string",
      demandOption: true,
      description:
        "Email of the user to act as (becomes the pod editor on creation)",
    },
    podId: {
      type: "string",
      description: "Existing pod (project space) sId — reused when provided",
    },
    name: {
      type: "string",
      default: "pod-state-live-test",
      description: "Pod name to reuse or create when --podId is omitted",
    },
    fresh: {
      type: "boolean",
      default: false,
      description:
        "Kill any existing pod sandbox first so the run goes through the full cold start (mounts + pod-state restore only run on creation)",
    },
  },
  async ({ wId, userEmail, podId, name, fresh, execute }, logger) => {
    const user = await UserResource.fetchByEmail(userEmail);
    if (!user) {
      logger.error({ userEmail }, "User not found");
      return;
    }
    let auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, wId);

    let pod: SpaceResource | null = null;
    if (podId) {
      pod = await SpaceResource.fetchById(auth, podId);
      if (!pod || !pod.isProject()) {
        logger.error({ podId }, "Pod not found (or not a project space)");
        return;
      }
    } else {
      const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
        includeProjectSpaces: true,
      });
      pod =
        spaces.find((space) => space.isProject() && space.name === name) ??
        null;
    }

    if (!execute) {
      logger.info(
        {
          pod: pod ? pod.sId : `(would create "${name}")`,
        },
        "Dry run — pass --execute to boot the pod sandbox"
      );
      return;
    }

    if (!pod) {
      const createResult = await createSpaceAndGroup(auth, {
        name,
        isRestricted: true,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });
      if (createResult.isErr()) {
        logger.error({ err: createResult.error }, "Pod creation failed");
        return;
      }
      logger.info({ podId: createResult.value.sId, name }, "Pod created");

      // createSpaceAndGroup grants the creator access through a NEW editor
      // group, but Authenticator snapshots group memberships at construction —
      // rebuild the auth and refetch the pod so canRead sees the membership.
      auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, wId);
      pod = await SpaceResource.fetchById(auth, createResult.value.sId);
      if (!pod) {
        logger.error(
          { podId: createResult.value.sId },
          "Pod created but could not be refetched"
        );
        return;
      }
    }

    if (!auth.can("read", pod)) {
      logger.error(
        { podId: pod.sId, userEmail },
        "User has no read access to this pod — pass a pod they are an editor of, or a fresh --name to create one"
      );
      return;
    }

    if (fresh) {
      const existing = await PodSandboxAdapter.fetchSandbox(auth, pod);
      if (existing) {
        // ensureActive's kill-requested branch destroys (running the
        // pre-destroy pod-state flush) and recreates — the same path an image
        // rollout takes.
        await existing.requestKill();
        logger.info(
          { e2bSandboxId: existing.providerId },
          "Existing sandbox marked for kill — it will be destroyed and recreated"
        );
      }
    }

    const readyResult = await ensurePodSandboxReady(auth, pod);
    if (readyResult.isErr()) {
      logger.error({ err: readyResult.error }, "ensurePodSandboxReady failed");
      return;
    }

    const { sandbox, freshlyCreated } = readyResult.value;
    if (!freshlyCreated) {
      logger.warn(
        {},
        "Reused a RUNNING sandbox: the GCS mounts and pod-state cold start only run on creation — rerun with --fresh to force the full lifecycle"
      );
    }
    logger.info(
      {
        podId: pod.sId,
        sandboxId: sandbox.sId,
        e2bSandboxId: sandbox.providerId,
        freshlyCreated,
      },
      `Pod sandbox ready — inspect it with: npx tsx scripts/sandbox_exec.ts -s ${sandbox.providerId}`
    );
  }
);
