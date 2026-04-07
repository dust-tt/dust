import { z } from "zod";

export type ModelId = number;

export const DbModelIdSchema = z.number();
