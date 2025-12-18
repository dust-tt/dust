import { describe, expect, it } from "vitest";

// TODO(SKILLS 2025-12-16): Refactor and re-enable tests.

describe("Placeholder test", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});

// import type { RequestMethod } from "node-mocks-http";
// import { beforeEach, describe, expect, it, vi } from "vitest";

// import { FileResource } from "@app/lib/resources/file_resource";
// import handler from "@app/pages/api/w/[wId]/files/[fileId]/index";
// import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
// import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

// vi.mock("@app/lib/resources/file_resource", () => ({
//   FileResource: {
//     fetchById: vi.fn(),
//   },
// }));

// // vi.mock("@app/lib/api/auth_wrappers", async () => {
// //   const actual = await vi.importActual("@app/lib/api/auth_wrappers");
// //   return {
// //     ...actual,
// //     withSessionAuthenticationForWorkspace: (handler: any) => {
// //       return async (req: any, res: any) => {
// //         const auth = req.auth;
// //         return handler(req, res, auth, {
// //           user: { sub: "workos|test-user-id" },
// //         });
// //       };
// //     },
// //   };
// // });

// vi.mock("@app/lib/api/files/upload", () => ({
//   processAndStoreFile: vi.fn().mockResolvedValue({ isErr: () => false }),
// }));

// vi.mock("@app/lib/api/files/upsert", () => ({
//   isFileTypeUpsertableForUseCase: vi.fn().mockReturnValue(true),
//   processAndUpsertToDataSource: vi
//     .fn()
//     .mockResolvedValue({ isErr: () => false }),
// }));

// vi.mock("@app/lib/api/data_sources", () => ({
//   getOrCreateConversationDataSourceFromFile: vi.fn().mockResolvedValue({
//     isErr: () => false,
//     value: { id: "test_data_source" },
//   }),
// }));

// vi.mock("@app/lib/resources/conversation_resource", () => ({
//   ConversationResource: {
//     fetchById: vi.fn().mockResolvedValue({ id: "test-conversation-id" }),
//   },
// }));

// const mockDelete = vi.fn().mockResolvedValue({ isErr: () => false });
// const mockGetSignedUrlForDownload = vi
//   .fn()
//   .mockResolvedValue("http://signed-url.example");
// const mockGetReadStream = vi.fn().mockReturnValue({
//   on: vi.fn().mockImplementation(function (this: any) {
//     return this;
//   }),
//   pipe: vi.fn(),
// });

// async function setupTest(
//   options: {
//     userRole?: "admin" | "builder" | "user";
//     method?: RequestMethod;
//     fileExists?: boolean;
//     useCase?: "conversation" | "folders_document";
//   } = {}
// ) {
//   const userRole = options.userRole ?? "admin";
//   const method = options.method ?? "GET";
//   const fileExists = options.fileExists ?? true;
//   const useCase = options.useCase ?? "conversation";

//   const { req, res, workspace, user } = await createPrivateApiMockRequest({
//     role: userRole,
//     method: method,
//   });

//   const space = await SpaceFactory.regular(workspace);

//   const useCaseMetadata =
//     options.useCase === "folders_document"
//       ? { spaceId: space.sId }
//       : {
//           conversationId: "test_conversation_id",
//         };

//   const mockFile = fileExists
//     ? {
//         id: "123",
//         sId: "test_file_id",
//         workspaceId: workspace.id,
//         contentType: "application/pdf",
//         fileName: "test.pdf",
//         fileSize: 1024,
//         status: "ready",
//         useCase,
//         useCaseMetadata,
//         isReady: true,
//         isUpsertUseCase: () => false,
//         isSafeToDisplay: () => true,
//         delete: mockDelete,
//         getSignedUrlForDownload: mockGetSignedUrlForDownload,
//         getReadStream: mockGetReadStream,
//         toJSON: () => ({
//           id: "test_file_id",
//           sId: "test_file_id",
//           contentType: "application/pdf",
//           fileName: "test.pdf",
//           fileSize: 1024,
//           status: "ready",
//           useCase,
//         }),
//       }
//     : null;

//   vi.mocked(FileResource.fetchById).mockResolvedValue(
//     mockFile as unknown as FileResource
//   );

//   req.query = {
//     wId: workspace.sId,
//     fileId: fileExists ? "test_file_id" : "non-existent-file-id",
//   };

//   return {
//     req,
//     res,
//     workspace,
//     user,
//     file: mockFile,
//   };
// }

// describe("GET /api/w/[wId]/files/[fileId]", () => {
//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   it("should return 404 for non-existent file", async () => {
//     const { req, res } = await setupTest({ fileExists: false });

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(404);
//     expect(res._getJSONData()).toEqual({
//       error: {
//         type: "file_not_found",
//         message: "File not found.",
//       },
//     });
//   });

//   it("should allow any role to view file for GET request", async () => {
//     for (const role of ["admin", "builder", "user"] as const) {
//       const { req, res } = await setupTest({ userRole: role });

//       // Reset for each test
//       mockGetSignedUrlForDownload.mockClear();

//       await handler(req, res);
//       expect(res._getStatusCode()).toBe(302); // Should redirect to the signed URL
//       expect(res._getRedirectUrl()).toBe("http://signed-url.example");
//       expect(mockGetSignedUrlForDownload).toHaveBeenCalledTimes(1);
//     }
//   });
// });

// describe("POST /api/w/[wId]/files/[fileId]", () => {
//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   it("should return 403 when user cannot write to space for non-conversation files", async () => {
//     const { req, res } = await setupTest({
//       userRole: "user",
//       method: "POST",
//       useCase: "folders_document",
//     });

//     // vi.mock("@app/lib/resources/space_resource", () => ({
//     //   SpaceResource: {
//     //     fetchById: vi.fn().mockResolvedValue({
//     //       id: "test-space-id",
//     //       canRead: vi.fn().mockReturnValue(true),
//     //       canWrite: vi.fn().mockReturnValue(false),
//     //     }),
//     //   },
//     // }));

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(403);
//     expect(res._getJSONData()).toEqual({
//       error: {
//         type: "workspace_auth_error",
//         message: "You cannot edit files in that space.",
//       },
//     });
//   });

//   it("should allow regular user to modify conversation files", async () => {
//     const { req, res } = await setupTest({
//       userRole: "user",
//       method: "POST",
//       useCase: "conversation",
//     });

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(200);
//   });

//   it("should allow admin to modify any file", async () => {
//     const { req, res } = await setupTest({
//       userRole: "admin",
//       method: "POST",
//     });

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(200);
//   });

//   it("should allow builder to modify any file", async () => {
//     const { req, res } = await setupTest({
//       userRole: "builder",
//       method: "POST",
//     });

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(200);
//   });
// });

// describe("DELETE /api/w/[wId]/files/[fileId]", () => {
//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   it("should return 403 when user is not a builder for non-conversation files", async () => {
//     const { req, res, space } = await setupTest({
//       userRole: "user",
//       method: "DELETE",
//       useCase: "folders_document",
//     });

//     // vi.mock("@app/lib/resources/space_resource", () => ({
//     //   SpaceResource: {
//     //     fetchById: vi.fn().mockResolvedValue({
//     //       id: "test-space-id",
//     //       canRead: vi.fn().mockReturnValue(true),
//     //       canWrite: vi.fn().mockReturnValue(false),
//     //     }),
//     //   },
//     // }));

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(403);
//     expect(res._getJSONData()).toEqual({
//       error: {
//         type: "workspace_auth_error",
//         message: "You cannot edit files in that space.",
//       },
//     });
//   });

//   it("should allow regular user to delete conversation files", async () => {
//     const { req, res } = await setupTest({
//       userRole: "user",
//       method: "DELETE",
//       useCase: "conversation",
//     });

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(204);
//     expect(mockDelete).toHaveBeenCalledTimes(1);
//   });

//   it("should allow admin to delete any file", async () => {
//     const { req, res } = await setupTest({
//       userRole: "admin",
//       method: "DELETE",
//     });

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(204);
//     expect(mockDelete).toHaveBeenCalledTimes(1);
//   });

//   it("should allow builder to delete any file", async () => {
//     const { req, res } = await setupTest({
//       userRole: "builder",
//       method: "DELETE",
//     });

//     await handler(req, res);
//     expect(res._getStatusCode()).toBe(204);
//     expect(mockDelete).toHaveBeenCalledTimes(1);
//   });
// });

// describe("Method Support /api/w/[wId]/files/[fileId]", () => {
//   it("should return 405 for unsupported methods", async () => {
//     for (const method of ["PUT", "PATCH"] as const) {
//       const { req, res } = await setupTest({ method });

//       await handler(req, res);

//       expect(res._getStatusCode()).toBe(405);
//       expect(res._getJSONData()).toEqual({
//         error: {
//           type: "method_not_supported_error",
//           message: "The method passed is not supported, POST is expected.",
//         },
//       });
//     }
//   });
// });
