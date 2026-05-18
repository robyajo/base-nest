import "dotenv/config";
import * as bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from "generated/prisma/client";
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const url = process.env.DATABASE_URL || 'file:./dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed...');
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash('password123', saltRounds);

  console.log('🧹 Cleaning up database...');
  await prisma.loginLog.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.apiToken.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.post.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  console.log('🏷️ Seeding categories...');
  const catTech = await prisma.category.create({ data: { name: 'Technology' } });
  const catNest = await prisma.category.create({ data: { name: 'NestJS' } });
  const catWeb = await prisma.category.create({ data: { name: 'Web Development' } });
  const catTutorial = await prisma.category.create({ data: { name: 'Tutorial' } });
  const catLifestyle = await prisma.category.create({ data: { name: 'Lifestyle' } });

  console.log('👥 Seeding users & profiles...');
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@example.com',
      displayName: 'Admin Super',
      passwordHash: hashedPassword,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      role: "ADMIN" as UserRole,
      profile: {
        create: { bio: 'System Administrator and Senior Backend Architect.', website: 'https://vynix.com' },
      },
    },
  });

  const john = await prisma.user.create({
    data: {
      username: 'johndoe',
      email: 'john@example.com',
      displayName: 'John Doe',
      passwordHash: hashedPassword,
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      role: "USER" as UserRole,
      profile: {
        create: { bio: 'Fullstack developer passionate about NestJS, Prisma, and PostgreSQL.', youtube: 'https://youtube.com/@johndoe' },
      },
    },
  });

  const jane = await prisma.user.create({
    data: {
      username: 'janesmith',
      email: 'jane@example.com',
      displayName: 'Jane Smith',
      passwordHash: hashedPassword,
      isActive: true,
      emailVerified: false,
      role: UserRole.USER,
      profile: {
        create: { bio: 'Enthusiastic tech writer and frontend developer.', instagram: 'https://instagram.com/janesmith' },
      },
    },
  });

  console.log('📝 Seeding posts...');
  await prisma.post.create({
    data: {
      title: 'Getting Started with NestJS and Prisma 7',
      content: 'Prisma 7 introduces amazing new features like modular schema files (prismaSchemaFolder) and native driver adapters. NestJS pairs perfectly with it to build robust, scalable backend applications.',
      published: true,
      authorId: admin.id,
      categories: {
        connect: [{ id: catTech.id }, { id: catNest.id }, { id: catTutorial.id }],
      },
    },
  });

  await prisma.post.create({
    data: {
      title: 'Building REST APIs with PostgreSQL',
      content: 'PostgreSQL is an incredibly powerful relational database. When combined with Prisma Client and PostgreSQL adapter, building type-safe queries is an absolute delight.',
      published: true,
      authorId: john.id,
      categories: {
        connect: [{ id: catTech.id }, { id: catWeb.id }, { id: catTutorial.id }],
      },
    },
  });

  await prisma.post.create({
    data: {
      title: 'Draft: Advanced Authentication Patterns',
      content: 'In this upcoming guide, we will explore JWTs, Refresh Tokens, Api Tokens, and Role-Based Access Control (RBAC) in NestJS.',
      published: false,
      authorId: john.id,
      categories: {
        connect: [{ id: catTutorial.id }, { id: catNest.id }],
      },
    },
  });

  await prisma.post.create({
    data: {
      title: 'My Journey into Tech and Lifestyle Balance',
      content: 'Balancing a career in tech while maintaining a healthy lifestyle is crucial. Here are my top tips for remote software developers.',
      published: true,
      authorId: jane.id,
      categories: {
        connect: [{ id: catLifestyle.id }, { id: catWeb.id }],
      },
    },
  });

  console.log('🔑 Seeding API tokens & auth records...');
  await prisma.apiToken.create({
    data: {
      userId: admin.id,
      name: 'CLI Management Token',
      token: 'api_' + Math.random().toString(36).substring(2, 15),
      scopes: 'admin:all,posts:write,users:read',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
  });

  await prisma.refreshToken.create({
    data: {
      userId: admin.id,
      tokenHash: 'rfr_' + Math.random().toString(36).substring(2, 15),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
  });

  await prisma.verificationToken.create({
    data: {
      userId: jane.id,
      token: 'vrf_' + Math.random().toString(36).substring(2, 15),
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    },
  });

  console.log('🛡️ Seeding login logs...');
  await prisma.loginLog.createMany({
    data: [
      { userId: admin.id, method: 'EMAIL_PASSWORD', ip: '192.168.1.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
      { userId: john.id, method: 'EMAIL_PASSWORD', ip: '10.0.0.5', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15' },
      { userId: jane.id, method: 'EMAIL_PASSWORD', ip: '172.16.0.12', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0' },
    ],
  });

  console.log('✅ Seeding completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });