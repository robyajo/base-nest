#!/usr/bin/env node
/**
 * Switch project from SQLite to PostgreSQL.
 * Usage: node setup-pg.mjs [database-name]
 *
 * Updates schema.prisma, .env, prisma.service.ts, seed.ts,
 * installs @prisma/adapter-pg + pg, removes better-sqlite3 deps.
 */

import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { argv, exit, cwd } from 'node:process';

const DB_USER = 'postgres';
const DB_PASS = '123';
const DB_HOST = 'localhost';
const DB_PORT = '5432';

const projectDir = cwd();
const dbName = argv[2] || basename(projectDir).replace(/[^a-zA-Z0-9_-]/g, '_');

function fail(msg) {
  console.error('\x1b[31m✖\x1b[0m ' + msg);
  exit(1);
}

function ok(msg) {
  console.log('\x1b[32m✔\x1b[0m ' + msg);
}

function warn(msg) {
  console.log('\x1b[33m⚠\x1b[0m ' + msg);
}

// ─── Validate project ────────────────────────────────

const pkgPath = resolve(projectDir, 'package.json');
if (!existsSync(pkgPath)) fail('Not a Node.js project (no package.json)');

// ─── 1. Update schema.prisma ──────────────────────────

const schemaPaths = [
  resolve(projectDir, 'prisma', 'schema.prisma'),
  resolve(projectDir, 'prisma', 'schema.prisma'),
];

let schemaPath = schemaPaths.find(p => existsSync(p));
if (!schemaPath) fail('prisma/schema.prisma not found');

let schema = readFileSync(schemaPath, 'utf-8');
if (!schema.includes('provider = "sqlite"')) {
  warn('Schema is not using SQLite — skipping provider change');
} else {
  schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
  writeFileSync(schemaPath, schema);
  ok('schema.prisma → provider = "postgresql"');
}

// ─── 2. Update migration_lock.toml & clean migrations ──

const lockPath = resolve(projectDir, 'prisma', 'migrations', 'migration_lock.toml');
const migrationsDir = resolve(projectDir, 'prisma', 'migrations');

if (existsSync(lockPath)) {
  let lock = readFileSync(lockPath, 'utf-8');
  if (lock.includes('provider = "sqlite"')) {
    lock = lock.replace('provider = "sqlite"', 'provider = "postgresql"');
    writeFileSync(lockPath, lock);
    ok('migration_lock.toml → provider = "postgresql"');
  }
}

// Delete old SQLite migrations (keep lock file)
if (existsSync(migrationsDir)) {
  for (const entry of readdirSync(migrationsDir)) {
    const full = resolve(migrationsDir, entry);
    if (entry !== 'migration_lock.toml' && statSync(full).isDirectory()) {
      rmSync(full, { recursive: true, force: true });
    }
  }
  ok('Old SQLite migrations removed');
}

// ─── 3. Update .env ────────────────────────────────────

const envPath = resolve(projectDir, '.env');
let envContent = '';
if (existsSync(envPath)) {
  envContent = readFileSync(envPath, 'utf-8');
}

const pgUrl = `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${dbName}?schema=public`;

if (envContent.includes('DATABASE_URL=')) {
  envContent = envContent.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${pgUrl}"`);
} else {
  envContent += `\nDATABASE_URL="${pgUrl}"\n`;
}
writeFileSync(envPath, envContent);
ok(`.env → DATABASE_URL="${pgUrl}"`);

// ─── 4. Update prisma.service.ts ───────────────────────

const servicePath = resolve(projectDir, 'src', 'prisma', 'prisma.service.ts');
if (!existsSync(servicePath)) fail('src/prisma/prisma.service.ts not found');

const pgService = `import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
`;

writeFileSync(servicePath, pgService);
ok('src/prisma/prisma.service.ts → PrismaPg adapter');

// ─── 5. Update seed.ts ─────────────────────────────────

const seedPath = resolve(projectDir, 'prisma', 'seed.ts');
if (existsSync(seedPath)) {
  let pgSeed = readFileSync(seedPath, 'utf-8');

  const oldBlock = `import { PrismaClient, UserRole } from "generated/prisma/client";
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const url = process.env.DATABASE_URL || 'file:./dev.db';
const adapter = new PrismaBetterSqlite3({ url });
const prisma = new PrismaClient({ adapter });`;

  const newBlock = `import { PrismaClient, UserRole } from "generated/prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });`;

  if (pgSeed.includes(oldBlock)) {
    pgSeed = pgSeed.replace(oldBlock, newBlock);
    writeFileSync(seedPath, pgSeed);
    ok('prisma/seed.ts → PrismaPg adapter');
  } else {
    warn('seed.ts format unexpected — skipping auto-update');
  }
}

// ─── 6. Update package.json deps ───────────────────────

let pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

// Remove SQLite deps
delete pkg.dependencies?.['@prisma/adapter-better-sqlite3'];
delete pkg.dependencies?.['better-sqlite3'];
delete pkg.dependencies?.['@types/better-sqlite3'];
delete pkg.devDependencies?.['@prisma/adapter-better-sqlite3'];
delete pkg.devDependencies?.['better-sqlite3'];
delete pkg.devDependencies?.['@types/better-sqlite3'];

// Add PostgreSQL deps
const pgDeps = {
  '@prisma/adapter-pg': '^7.8.0',
  'pg': '^8.20.0',
};
const pgDevDeps = {
  '@types/pg': '^8.20.0',
};

if (pkg.devDependencies) {
  Object.assign(pkg.devDependencies, pgDeps, pgDevDeps);
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
ok('package.json → added @prisma/adapter-pg, pg');

// ─── 7. Install & generate ─────────────────────────────

console.log('');
console.log('\x1b[36m::\x1b[0m Installing PostgreSQL dependencies...');
try {
  execSync('npm install', { cwd: projectDir, stdio: 'inherit', timeout: 120000 });
  ok('Dependencies installed');
} catch {
  fail('npm install failed');
}

console.log('\x1b[36m::\x1b[0m Regenerating Prisma client...');
try {
  execSync('npx prisma generate', { cwd: projectDir, stdio: 'inherit', timeout: 30000 });
  ok('Prisma client regenerated');
} catch {
  warn('npx prisma generate failed — run it manually');
}

console.log('');
console.log('\x1b[32m✔ PostgreSQL setup complete!\x1b[0m');
console.log('');
console.log('  \x1b[2mNext steps:\x1b[0m');
console.log('');
console.log(`    \x1b[36mnpx prisma migrate dev\x1b[0m`);
console.log(`    \x1b[36mnpm run start:dev\x1b[0m`);
console.log('');
