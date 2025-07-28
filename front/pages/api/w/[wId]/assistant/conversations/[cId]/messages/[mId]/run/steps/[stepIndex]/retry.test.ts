import { describe, expect, it, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types";

import handler from "./retry";

// Mock getConversation.
vi.mock("@app/lib/api/assistant/conversation/fetch", async () => {
  const actual = (await vi.importActual(
    "@app/lib/api/assistant/conversation/fetch"
  )) as any;
  return {
    ...actual,
    getConversation: vi
      .fn()
      .mockImplementation((auth, conversationId, includeDeleted) => {
        if (conversationId === "mockedConversationId") {
          return Promise.resolve(
            new Ok({
              content: [
                [
                  {
                    id: 785,
                    sId: "WbrZZgg8Zj",
                    type: "user_message",
                  },
                ],
                [
                  {
                    id: 786,
                    sId: "VP3f0qXQ15",
                    type: "agent_message",
                  },
                  {
                    id: 813,
                    sId: "Wful9YWRJ1",
                    type: "agent_message",
                  },
                ],
                [
                  {
                    id: 811,
                    sId: "gIi9fM0VjS",
                    type: "user_message",
                  },
                ],
                [
                  {
                    id: 812,
                    sId: "jMqRspKaSf",
                    type: "agent_message",
                  },
                ],
              ],
            })
          );
        }
        return actual.getConversation(auth, conversationId, includeDeleted);
      }),
  };
});

describe("POST /api/w/[wId]/conversations/[cId]/messages/[mId]/run/steps/[stepIndex]/retry", () => {
  [
    {
      name: "should return 400 when cId is undefined",
      query: { cId: undefined, mId: "mId", stepIndex: "0" },
      expected: {
        statusCode: 400,
        responseData: {
          error: {
            type: "invalid_request_error",
            message: "Invalid conversation ID",
          },
        },
      },
    },
    {
      name: "should return 400 when mId is undefined",
      query: { cId: "cId", mId: undefined, stepIndex: "0" },
      expected: {
        statusCode: 400,
        responseData: {
          error: {
            type: "invalid_request_error",
            message: "Invalid message ID",
          },
        },
      },
    },
    {
      name: "should return 400 when stepIndex is undefined",
      query: { cId: "cId", mId: "mId", stepIndex: undefined },
      expected: {
        statusCode: 400,
        responseData: {
          error: {
            type: "invalid_request_error",
            message: "Invalid step index",
          },
        },
      },
    },
    {
      name: "should return 400 when stepIndex is not a positive integer",
      query: { cId: "cId", mId: "mId", stepIndex: "stepIndex" },
      expected: {
        statusCode: 400,
        responseData: {
          error: {
            type: "invalid_request_error",
            message: "stepIndex must be a valid non-negative integer",
          },
        },
      },
    },
    {
      name: "should return 400 when stepIndex is a negative integer",
      query: { cId: "cId", mId: "mId", stepIndex: "-1" },
      expected: {
        statusCode: 400,
        responseData: {
          error: {
            type: "invalid_request_error",
            message: "stepIndex must be a valid non-negative integer",
          },
        },
      },
    },
    {
      name: "should return 400 when mId is not an agent message",
      query: { cId: "mockedConversationId", mId: "WbrZZgg8Zj", stepIndex: "0" },
      expected: {
        statusCode: 400,
        responseData: {
          error: {
            type: "invalid_request_error",
            message: "Message WbrZZgg8Zj is not an agent message",
          },
        },
      },
    },
    {
      name: "should return 400 when body is not correct",
      query: { cId: "mockedConversationId", mId: "Wful9YWRJ1", stepIndex: "0" },
      expected: {
        statusCode: 400,
        responseData: {
          error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid: Expecting boolean at retryBlockedToolsOnly but instead got: undefined.",
          },
        },
      },
    },
    {
      name: "should return 404 when conversation is not found",
      query: {
        cId: "cId",
        mId: "mId",
        stepIndex: "0",
      },
      expected: {
        statusCode: 404,
        responseData: {
          error: {
            type: "conversation_not_found",
            message: "Cannot access conversation: conversation_not_found",
          },
        },
      },
    },
    {
      name: "should return 404 when message is not found",
      query: {
        cId: "mockedConversationId",
        mId: "mId",
        stepIndex: "0",
      },
      expected: {
        statusCode: 404,
        responseData: {
          error: {
            type: "message_not_found",
            message:
              "Message mId not found in conversation mockedConversationId",
          },
        },
      },
    },
    {
      name: "should return 200",
      query: {
        cId: "mockedConversationId",
        mId: "Wful9YWRJ1",
        stepIndex: "0",
      },
      body: {
        retryBlockedToolsOnly: true,
      },
      expected: {
        statusCode: 200,
        responseData: {},
      },
    },
  ].forEach(({ name, query, body, expected }) => {
    it(name, async () => {
      const { req, res } = await createPrivateApiMockRequest({
        role: "user",
        method: "POST",
      });
      req.query = { ...req.query, ...query };
      if (body) {
        req.body = body;
      }
      await handler(req, res);
      expect(res._getStatusCode()).toBe(expected.statusCode);
      expect(res._getJSONData()).toEqual(expected.responseData);
    });
  });
});
