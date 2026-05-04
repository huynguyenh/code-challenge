import type { Prisma, Task } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type {
  CreateTaskInput,
  ListTasksQuery,
  UpdateTaskInput,
} from './schema.js';

// Centralised "not soft-deleted" predicate. Every read goes through this
// so a deleted row can never accidentally leak back to a client.
const NOT_DELETED: Prisma.TaskWhereInput = { deletedAt: null };

// Snake_case at the API boundary, camelCase inside the service. The DB
// already uses snake_case so this keeps the wire shape feeling like a
// regular REST API rather than a leaky Prisma export.
const serialise = (task: Task) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  due_date: task.dueDate,
  assignee_id: task.assigneeId,
  created_by: task.createdById,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
});

export type SerialisedTask = ReturnType<typeof serialise>;

export async function createTask(
  userId: string,
  input: CreateTaskInput,
): Promise<SerialisedTask> {
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'todo',
      dueDate: input.due_date ? new Date(input.due_date) : null,
      assigneeId: input.assignee_id ?? null,
      createdById: userId,
    },
  });
  return serialise(task);
}

export async function listTasks(
  userId: string,
  query: ListTasksQuery,
): Promise<{
  data: SerialisedTask[];
  meta: { page: number; pageSize: number; total: number };
}> {
  const where: Prisma.TaskWhereInput = {
    ...NOT_DELETED,
    createdById: userId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    ...(query.dueBefore || query.dueAfter
      ? {
          dueDate: {
            ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
            ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            {
              title: {
                contains: query.q,
                mode: 'insensitive' as const,
              },
            },
            {
              description: {
                contains: query.q,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    data: rows.map(serialise),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
    },
  };
}

// Loads a task that the user owns and that hasn't been soft-deleted.
// Cross-user access collapses to 404 to prevent ID-existence probing
// (foreign IDs and unknown IDs look identical to the caller).
async function loadOwned(id: string, userId: string): Promise<Task> {
  const task = await prisma.task.findFirst({
    where: { id, createdById: userId, ...NOT_DELETED },
  });
  if (!task) throw AppError.notFound('Task not found');
  return task;
}

export async function getTask(
  userId: string,
  id: string,
): Promise<SerialisedTask> {
  return serialise(await loadOwned(id, userId));
}

export async function updateTask(
  userId: string,
  id: string,
  input: UpdateTaskInput,
): Promise<SerialisedTask> {
  // Cheap existence/ownership probe with the soft-delete filter applied.
  await loadOwned(id, userId);

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description ?? null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.due_date !== undefined
        ? {
            dueDate: input.due_date ? new Date(input.due_date) : null,
          }
        : {}),
      ...(input.assignee_id !== undefined
        ? { assigneeId: input.assignee_id ?? null }
        : {}),
    },
  });
  return serialise(task);
}

export async function deleteTask(
  userId: string,
  id: string,
): Promise<void> {
  // Atomic soft-delete: only set deleted_at if the task is currently owned
  // by the user AND not already deleted. Prevents a TOCTOU between a
  // findFirst-then-update and a concurrent delete.
  const result = await prisma.task.updateMany({
    where: { id, createdById: userId, ...NOT_DELETED },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) {
    throw AppError.notFound('Task not found');
  }
}
