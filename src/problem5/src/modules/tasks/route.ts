import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { requireAuth } from '../../middleware/auth.js';
import {
  createTaskSchema,
  listTasksQuerySchema,
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createTaskSchema.parse(req.body);
      const task = await createTask(req.user!.id, input);
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  },
);

tasksRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listTasksQuerySchema.parse(req.query);
      const result = await listTasks(req.user!.id, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

tasksRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await getTask(req.user!.id, req.params['id']!);
      res.json(task);
    } catch (err) {
      next(err);
    }
  },
);

tasksRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateTaskSchema.parse(req.body);
      const task = await updateTask(
        req.user!.id,
        req.params['id']!,
        input,
      );
      res.json(task);
    } catch (err) {
      next(err);
    }
  },
);

tasksRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteTask(req.user!.id, req.params['id']!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
