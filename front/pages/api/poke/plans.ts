import { PlanType } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";
import Stripe from "stripe";

import { Authenticator, getSession } from "@app/lib/auth";
import { Plan } from "@app/lib/models";
import { getProduct } from "@app/lib/plans/stripe";
import { apiError, withLogging } from "@app/logger/withlogging";

export const PlanTypeSchema = t.type({
  code: t.string,
  name: t.string,
  limits: t.type({
    assistant: t.type({
      isSlackBotAllowed: t.boolean,
      maxMessages: t.number,
    }),
    connections: t.type({
      isSlackAllowed: t.boolean,
      isNotionAllowed: t.boolean,
      isGoogleDriveAllowed: t.boolean,
      isGithubAllowed: t.boolean,
      isIntercomAllowed: t.boolean,
      isWebCrawlerAllowed: t.boolean,
    }),
    dataSources: t.type({
      count: t.number,
      documents: t.type({
        count: t.number,
        sizeMb: t.number,
      }),
    }),
    users: t.type({
      maxUsers: t.number,
    }),
  }),
  stripeProductId: t.union([t.string, t.null]),
  billingType: t.union([
    t.literal("fixed"),
    t.literal("monthly_active_users"),
    t.literal("per_seat"),
    t.literal("free"),
  ]),
});

export type UpsertPokePlanResponseBody = {
  plan: PlanType;
};

export type GetPokePlansResponseBody = {
  plans: PlanType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetPokePlansResponseBody | UpsertPokePlanResponseBody | ReturnedAPIErrorType
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(session, null);
  const user = auth.user();

  if (!user || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const planModels = await Plan.findAll({ order: [["createdAt", "ASC"]] });
      const plans: PlanType[] = planModels.map((plan) => ({
        code: plan.code,
        name: plan.name,
        stripeProductId: plan.stripeProductId,
        status: "active",
        limits: {
          assistant: {
            isSlackBotAllowed: plan.isSlackbotAllowed,
            maxMessages: plan.maxMessages,
          },
          connections: {
            isSlackAllowed: plan.isManagedSlackAllowed,
            isNotionAllowed: plan.isManagedNotionAllowed,
            isGoogleDriveAllowed: plan.isManagedGoogleDriveAllowed,
            isGithubAllowed: plan.isManagedGithubAllowed,
            isIntercomAllowed: plan.isManagedIntercomAllowed,
            isWebCrawlerAllowed: plan.isManagedWebCrawlerAllowed,
          },
          dataSources: {
            count: plan.maxDataSourcesCount,
            documents: {
              count: plan.maxDataSourcesDocumentsCount,
              sizeMb: plan.maxDataSourcesDocumentsSizeMb,
            },
          },
          users: {
            maxUsers: plan.maxUsersInWorkspace,
          },
        },
        billingType: plan.billingType,
      }));

      const stripeProductIds = plans
        .filter(
          (plan): plan is PlanType & { stripeProductId: string } =>
            !!plan.stripeProductId
        )
        .map((plan) => plan.stripeProductId);

      const productById = (
        await Promise.all(
          stripeProductIds.map((stripeProductId) => getProduct(stripeProductId))
        )
      ).reduce((acc, product) => {
        acc[product.id] = product;
        return acc;
      }, {} as { [key: string]: Stripe.Product });

      res.status(200).json({
        plans: plans.map((plan) => ({
          ...plan,
          stripeProduct: plan.stripeProductId
            ? productById[plan.stripeProductId]
            : null,
        })),
      });
      return;

    case "POST":
      const bodyValidation = PlanTypeSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }
      const body = bodyValidation.right;
      if (body.stripeProductId) {
        try {
          await getProduct(body.stripeProductId);
        } catch (e) {
          if (!(e instanceof Stripe.errors.StripeError)) {
            throw e;
          }
          switch (e.type) {
            case "StripeInvalidRequestError":
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "stripe_invalid_product_id_error",
                  message: `The stripe product id seems invalid: ${e.message}`,
                },
              });
            default:
              throw e;
          }
        }
      }

      await Plan.upsert({
        code: body.code,
        name: body.name,
        stripeProductId: body.stripeProductId,
        isSlackbotAllowed: body.limits.assistant.isSlackBotAllowed,
        maxMessages: body.limits.assistant.maxMessages,
        isManagedSlackAllowed: body.limits.connections.isSlackAllowed,
        isManagedNotionAllowed: body.limits.connections.isNotionAllowed,
        isManagedGoogleDriveAllowed:
          body.limits.connections.isGoogleDriveAllowed,
        isManagedGithubAllowed: body.limits.connections.isGithubAllowed,
        isManagedIntercomAllowed: body.limits.connections.isIntercomAllowed,
        isManagedWebCrawlerAllowed: body.limits.connections.isWebCrawlerAllowed,
        maxDataSourcesCount: body.limits.dataSources.count,
        maxDataSourcesDocumentsCount: body.limits.dataSources.documents.count,
        maxDataSourcesDocumentsSizeMb: body.limits.dataSources.documents.sizeMb,
        maxUsersInWorkspace: body.limits.users.maxUsers,
        billingType: body.billingType,
      });
      res.status(200).json({
        plan: body,
      });
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
