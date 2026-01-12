import { z } from "zod";

export const ProductboardErrorResponseSchema = z.object({
  id: z.string(),
  errors: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      detail: z.string(),
      source: z
        .object({
          pointer: z.string().optional(),
          parameter: z.string().optional(),
        })
        .optional(),
    })
  ),
});

export const ProductboardLinksSchema = z
  .object({
    self: z.string().url(),
  })
  .passthrough();

export const ProductboardConfigLinksSchema = z
  .object({
    self: z.string().url().nullable(),
  })
  .passthrough();

export const ProductboardNoteRelationshipSchema = z.object({
  type: z.enum(["customer", "link"]),
  target: z.object({
    id: z.string().uuid(),
    type: z.string(),
    links: ProductboardLinksSchema.optional(),
  }),
});

export const ProductboardNoteSchema = z
  .object({
    id: z.string(),
    type: z.enum(["simple", "conversation", "opportunity"]),
    fields: z.record(z.string(), z.unknown()).optional(),
    relationships: z
      .object({
        data: z.array(ProductboardNoteRelationshipSchema),
        links: z
          .object({
            next: z.string().nullable(),
          })
          .optional(),
      })
      .optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    links: ProductboardLinksSchema,
  })
  .passthrough();

export type ProductboardNote = z.infer<typeof ProductboardNoteSchema>;

export const ProductboardNoteResponseSchema = z.object({
  data: ProductboardNoteSchema,
});

export const ProductboardEntityRelationshipSchema = z.object({
  type: z.enum(["parent", "child", "link", "isBlockedBy", "isBlocking"]),
  target: z.object({
    id: z.string().uuid(),
    type: z.enum([
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
    ]),
    links: ProductboardLinksSchema.optional(),
  }),
});

export const ProductboardEntitySchema = z
  .object({
    id: z.string(),
    type: z.enum([
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
    ]),
    fields: z.record(z.string(), z.unknown()).optional(),
    relationships: z
      .object({
        data: z.array(ProductboardEntityRelationshipSchema),
        links: z
          .object({
            next: z.string().nullable(),
          })
          .optional(),
      })
      .optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    links: ProductboardLinksSchema,
  })
  .passthrough();

export type ProductboardEntity = z.infer<typeof ProductboardEntitySchema>;

export const ProductboardEntityResponseSchema = z.object({
  data: ProductboardEntitySchema,
});

export const ProductboardRelationshipSchema = z.object({
  type: z.enum(["parent", "child", "link", "isBlockedBy", "isBlocking"]),
  target: z.object({
    id: z.string().uuid(),
    type: z.enum([
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
    ]),
    links: ProductboardLinksSchema.optional(),
  }),
});

export type ProductboardRelationship = z.infer<
  typeof ProductboardRelationshipSchema
>;

export const ProductboardRelationshipsListResponseSchema = z.object({
  data: z.array(ProductboardRelationshipSchema),
  links: z.object({
    next: z.string().nullable(),
  }),
});

export const ProductboardCustomFieldValueSchema = z
  .object({
    id: z.string().optional(),
    label: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .passthrough();

export const ProductboardCustomFieldSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    values: z.array(ProductboardCustomFieldValueSchema).optional(),
  })
  .passthrough();

export type ProductboardCustomField = z.infer<
  typeof ProductboardCustomFieldSchema
>;

export const ProductboardCustomFieldsListResponseSchema = z.object({
  data: z.array(ProductboardCustomFieldSchema),
});

export const ProductboardFieldLifecycleOpsSchema = z.object({
  set: z.boolean().default(false),
  clear: z.boolean().default(false),
  addItems: z.boolean().default(false),
  removeItems: z.boolean().default(false),
});

export const ProductboardFieldLifecycleSchema = z.object({
  create: ProductboardFieldLifecycleOpsSchema.optional(),
  update: ProductboardFieldLifecycleOpsSchema.optional(),
  patch: ProductboardFieldLifecycleOpsSchema.optional(),
});

export const ProductboardFieldConstraintsSchema = z.object({
  maxLength: z.number().min(0).optional(),
  maxSize: z.number().min(0).optional(),
  maxItems: z.number().min(0).optional(),
  allowEmpty: z.boolean().default(true),
  required: z.boolean().default(false),
  uniqueItems: z.boolean().default(false),
  values: z
    .object({
      query: z
        .object({
          links: z
            .object({
              list: z.string().url(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export const ProductboardConfigFieldSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    schema: z.unknown(),
    lifecycle: ProductboardFieldLifecycleSchema.optional(),
    constraints: ProductboardFieldConstraintsSchema.optional(),
    links: ProductboardConfigLinksSchema.optional(),
    default: z.unknown().optional(),
    values: z
      .object({
        inline: z
          .object({
            data: z.array(z.unknown()),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

export type ProductboardConfigField = z.infer<
  typeof ProductboardConfigFieldSchema
>;

export const ProductboardConfigurationRelationshipSchema = z.object({
  targetType: z.array(
    z.enum([
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
    ])
  ),
  cardinality: z.enum(["single", "multiple"]),
  mandatory: z.boolean().default(false),
});

export const ProductboardConfigurationSchema = z
  .object({
    type: z.enum([
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
      "simple",
      "conversation",
      "opportunity",
    ]),
    fields: z.record(z.string(), ProductboardConfigFieldSchema),
    relationships: z
      .record(z.string(), ProductboardConfigurationRelationshipSchema)
      .optional(),
    links: ProductboardLinksSchema.optional(),
  })
  .passthrough();

export type ProductboardConfiguration = z.infer<
  typeof ProductboardConfigurationSchema
>;

export const ProductboardConfigurationResponseSchema = z.object({
  data: ProductboardConfigurationSchema,
});

export const ProductboardConfigurationsResponseSchema = z.object({
  data: z.array(ProductboardConfigurationSchema).optional(),
});

export const ProductboardNotesListResponseSchema = z.object({
  data: z.array(ProductboardNoteResponseSchema.shape.data),
  links: z
    .object({
      next: z.string().nullable().optional(),
    })
    .optional(),
  totalResults: z.number().optional(),
});

export const ProductboardEntitiesSearchResponseSchema = z.object({
  data: z.array(ProductboardEntityResponseSchema.shape.data),
  links: z
    .object({
      next: z.string().nullable().optional(),
    })
    .optional(),
});
