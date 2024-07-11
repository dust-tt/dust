/**
 * @swagger
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: Authorization
 *       description: API key authentication. Prefix the key with 'Bearer '
 *   schemas:
 *     Conversation:
 *       type: object
 *       properties:
 *         conversation:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             created:
 *               type: integer
 *             sId:
 *               type: string
 *             owner:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 sId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 role:
 *                   type: string
 *                 segmentation:
 *                   type: string
 *                   nullable: true
 *                 flags:
 *                   type: array
 *                   items:
 *                     type: string
 *                 ssoEnforced:
 *                   type: boolean
 *                 whiteListedProviders:
 *                   type: array
 *                   items:
 *                     type: string
 *                 defaultEmbeddingProvider:
 *                   type: string
 *                   nullable: true
 *             title:
 *               type: string
 *             visibility:
 *               type: string
 *             content:
 *               type: array
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     sId:
 *                       type: string
 *                     type:
 *                       type: string
 *                     visibility:
 *                       type: string
 *                     version:
 *                       type: integer
 *                     created:
 *                       type: integer
 *                     user:
 *                       type: object
 *                       properties:
 *                         sId:
 *                           type: string
 *                         id:
 *                           type: integer
 *                         createdAt:
 *                           type: integer
 *                         username:
 *                           type: string
 *                         email:
 *                           type: string
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                         fullName:
 *                           type: string
 *                         provider:
 *                           type: string
 *                         image:
 *                           type: string
 *                     mentions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           configurationId:
 *                             type: string
 *                     content:
 *                       type: string
 *                     context:
 *                       type: object
 *                       properties:
 *                         username:
 *                           type: string
 *                         timezone:
 *                           type: string
 *                         fullName:
 *                           type: string
 *                         email:
 *                           type: string
 *                         profilePictureUrl:
 *                           type: string
 *                         origin:
 *                           type: string
 *                     agentMessageId:
 *                       type: integer
 *                     parentMessageId:
 *                       type: string
 *                     status:
 *                       type: string
 *                     actions:
 *                       type: array
 *                     chainOfThought:
 *                       type: string
 *                       nullable: true
 *                     rawContents:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           step:
 *                             type: integer
 *                           content:
 *                             type: string
 *                     error:
 *                       type: string
 *                       nullable: true
 *                     configuration:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         sId:
 *                           type: string
 *                         version:
 *                           type: integer
 *                         versionCreatedAt:
 *                           type: string
 *                           nullable: true
 *                         versionAuthorId:
 *                           type: string
 *                           nullable: true
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                         instructions:
 *                           type: string
 *                           nullable: true
 *                         pictureUrl:
 *                           type: string
 *                         status:
 *                           type: string
 *                         scope:
 *                           type: string
 *                         userListStatus:
 *                           type: string
 *                         model:
 *                           type: object
 *                           properties:
 *                             providerId:
 *                               type: string
 *                             modelId:
 *                               type: string
 *                             temperature:
 *                               type: number
 *                         actions:
 *                           type: array
 *                         maxToolsUsePerRun:
 *                           type: integer
 *                         templateId:
 *                           type: string
 *                           nullable: true
 */
