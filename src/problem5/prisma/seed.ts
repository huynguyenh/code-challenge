import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('demo1234', 10);

  // Demo user — the credentials a reviewer logs in with.
  const demo = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: { passwordHash, name: 'Demo User' },
    create: {
      email: 'demo@example.com',
      name: 'Demo User',
      passwordHash,
    },
  });

  // Two more users for the assignee filter to be meaningful.
  // They have credentials too, so a reviewer can log in as any of them.
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: { passwordHash, name: 'Alice' },
    create: {
      email: 'alice@example.com',
      name: 'Alice',
      passwordHash,
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: { passwordHash, name: 'Bob' },
    create: { email: 'bob@example.com', name: 'Bob', passwordHash },
  });

  // Make the seed idempotent by clearing demo's tasks first.
  await prisma.task.deleteMany({ where: { createdById: demo.id } });

  await prisma.task.createMany({
    data: [
      {
        title: 'Write the plan',
        description: 'Principal-engineer plan with ACs and use cases',
        status: TaskStatus.done,
        createdById: demo.id,
        assigneeId: demo.id,
      },
      {
        title: 'Build Problem 4',
        description: 'Three sum_to_n implementations with complexity analysis',
        status: TaskStatus.done,
        createdById: demo.id,
        assigneeId: demo.id,
      },
      {
        title: 'Build Problem 5 — auth module',
        description: 'Login endpoint + JWT bearer middleware',
        status: TaskStatus.in_progress,
        createdById: demo.id,
        assigneeId: demo.id,
      },
      {
        title: 'Build Problem 5 — tasks CRUD',
        description: 'Filters, soft delete, and integration tests',
        status: TaskStatus.todo,
        createdById: demo.id,
        assigneeId: alice.id,
        dueDate: new Date('2026-05-15'),
      },
      {
        title: 'Polish README',
        description: 'Reviewer-first setup walkthrough',
        status: TaskStatus.todo,
        createdById: demo.id,
        assigneeId: bob.id,
        dueDate: new Date('2026-05-20'),
      },
    ],
  });

  console.log('Seeded:');
  console.log('  - demo@example.com / demo1234   (the reviewer login)');
  console.log('  - alice@example.com / demo1234  (assignee for one of the demo tasks)');
  console.log('  - bob@example.com   / demo1234  (assignee for one of the demo tasks)');
  console.log('  - 5 tasks for demo user (mix of statuses + due dates)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
