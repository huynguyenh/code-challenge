import { z } from 'zod';

const taskStatus = z.enum(['todo', 'in_progress', 'done']);

// Accept any RFC 3339-ish ISO date string the JS Date parser understands.
// Stricter than `z.string().datetime()` would reject `2026-05-15` (no time
// component) which feels needlessly hostile for date-only filters.
const isoDate = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

// Path-param schema for /tasks/:id. Validating up-front prevents Prisma's
// own UUID rejection (P2023) from leaking through as a 500 INTERNAL_ERROR.
export const taskIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).nullable().optional(),
  status: taskStatus.optional(),
  due_date: isoDate.nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const listTasksQuerySchema = z.object({
  status: taskStatus.optional(),
  // Cap at 200 chars: combined with the O(n) ILIKE this is a cheap
  // amplification surface if left unbounded.
  q: z.string().trim().min(1).max(200).optional(),
  dueBefore: isoDate.optional(),
  dueAfter: isoDate.optional(),
  assigneeId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type TaskIdParam = z.infer<typeof taskIdParamSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
