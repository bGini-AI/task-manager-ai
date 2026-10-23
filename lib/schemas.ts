import { z } from "zod";
import { PRIORITIES, STATUSES, VIEWS } from "./constants";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const taskCreateSchema = z.object({
  space_id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  due_date: date.nullable().optional(),
  position: z.number().optional(),
});

export const taskPatchSchema = z.object({
  space_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  due_date: date.nullable().optional(),
  position: z.number().optional(),
});

export const spaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  view: z.enum(VIEWS),
});

export const spacePatchSchema = spaceCreateSchema.partial();
