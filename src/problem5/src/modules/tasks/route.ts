import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
  taskIdParamSchema,
  updateTaskSchema,
} from './schema.js';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from './service.js';

export const tasksRouter = Router();

// Every endpoint under /tasks requires a valid bearer token.
tasksRouter.use(requireAuth);

tasksRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createTaskSchema.parse(req.body);
    const task = await createTask(req.user!.id, input);
    res.status(201).json(task);
  }),
);

tasksRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listTasksQuerySchema.parse(req.query);
    const result = await listTasks(req.user!.id, query);
    res.json(result);
  }),
);

tasksRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = taskIdParamSchema.parse(req.params);
    const task = await getTask(req.user!.id, id);
    res.json(task);
  }),
);

tasksRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = taskIdParamSchema.parse(req.params);
    const input = updateTaskSchema.parse(req.body);
    const task = await updateTask(req.user!.id, id, input);
    res.json(task);
  }),
);

tasksRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = taskIdParamSchema.parse(req.params);
    await deleteTask(req.user!.id, id);
    res.status(204).send();
  }),
);
