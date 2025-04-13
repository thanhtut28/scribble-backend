import { PrismaClient } from '@prisma/client';
import * as argon from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // Clear existing users
  await prisma.user.deleteMany({});

  // Create admin user
  const adminPassword = await argon.hash('admin123');
  await prisma.user.create({
    data: {
      email: 'admin@example.com',
      username: 'admin',
      password: adminPassword,
    },
  });

  // Create test users
  const testPassword = await argon.hash('password123');

  // Create 5 test users
  const testUsers = Array.from({ length: 5 }).map((_, i) => ({
    email: `user${i + 1}@example.com`,
    username: `user${i + 1}`,
    password: testPassword,
  }));

  await prisma.user.createMany({
    data: testUsers,
  });

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
