import { PrismaClient } from '@prisma/client';
import * as argon from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // Clear existing users
  await prisma.user.deleteMany({});

  // Create admin user
  const adminPassword = await argon.hash('admin123');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      username: 'admin',
      password: adminPassword,
      gamesPlayed: 25,
      gamesWon: 18,
      totalScore: 4300,
    },
  });
  console.log(`Created admin user: ${admin.username} (ID: ${admin.id})`);

  // Create regular users with statistics
  const users = [
    {
      email: 'john@example.com',
      username: 'john_doe',
      password: 'password123',
      gamesPlayed: 32,
      gamesWon: 15,
      totalScore: 3800,
    },
    {
      email: 'sarah@example.com',
      username: 'sarah_artist',
      password: 'password123',
      gamesPlayed: 42,
      gamesWon: 28,
      totalScore: 6200,
    },
    {
      email: 'alex@example.com',
      username: 'alex_gamer',
      password: 'password123',
      gamesPlayed: 15,
      gamesWon: 5,
      totalScore: 1200,
    },
    {
      email: 'emma@example.com',
      username: 'emma_draw',
      password: 'password123',
      gamesPlayed: 38,
      gamesWon: 22,
      totalScore: 5100,
    },
    {
      email: 'mike@example.com',
      username: 'mike_sketch',
      password: 'password123',
      gamesPlayed: 20,
      gamesWon: 8,
      totalScore: 1900,
    },
  ];

  for (const userData of users) {
    const hashedPassword = await argon.hash(userData.password);
    const user = await prisma.user.create({
      data: {
        ...userData,
        password: hashedPassword,
      },
    });
    console.log(`Created user: ${user.username} (ID: ${user.id})`);
  }

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
