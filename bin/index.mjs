#!/usr/bin/env node

import degit from 'degit';
import prompts from 'prompts';
import pc from 'picocolors';
import ora from 'ora';
import gradient from 'gradient-string';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, basename } from 'node:path';
import { argv, exit, cwd, version as nodeVersion, hrtime } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

// ─── Node version check ────────────────────────────────

const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
if (nodeMajor < 18) {
  console.error(pc.bgRed(pc.white(' ERROR ')) + pc.red(` Node.js >= 18 required (detected ${nodeVersion})`));
  exit(1);
}

// ─── Utils ─────────────────────────────────────────────

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

function removeRecursive(dir) {
  if (!existsSync(dir)) return;
  rmSync(dir, { recursive: true, force: true });
}

function validateProjectName(name) {
  if (!name || !name.trim()) return 'Project name cannot be empty';
  if (name.length > 214) return 'Project name must be 214 characters or less';
  if (!/^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(name.trim())) {
    return 'Must be a valid npm package name (lowercase, hyphens allowed)';
  }
  return true;
}

function elapsed(start) {
  const ms = Number((hrtime.bigint() - start) / 1_000_000n);
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function padRight(str, len) {
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function generateSecret() {
  return randomBytes(32).toString('hex');
}

// ─── PostgreSQL setup ──────────────────────────────────

const PG_USER = 'postgres';
const PG_PASS = '123';

async function setupPostgres(target, dbName) {
  const schemaPath = join(target, 'prisma', 'schema.prisma');
  if (existsSync(schemaPath)) {
    let s = readFileSync(schemaPath, 'utf-8');
    s = s.replace('provider = "sqlite"', 'provider = "postgresql"');
    writeFileSync(schemaPath, s);
  }

  const lockPath = join(target, 'prisma', 'migrations', 'migration_lock.toml');
  const migrationsDir = join(target, 'prisma', 'migrations');
  if (existsSync(lockPath)) {
    let lock = readFileSync(lockPath, 'utf-8');
    if (lock.includes('provider = "sqlite"')) {
      lock = lock.replace('provider = "sqlite"', 'provider = "postgresql"');
      writeFileSync(lockPath, lock);
    }
  }
  if (existsSync(migrationsDir)) {
    for (const entry of readdirSync(migrationsDir)) {
      const full = join(migrationsDir, entry);
      if (entry !== 'migration_lock.toml' && statSync(full).isDirectory()) {
        rmSync(full, { recursive: true, force: true });
      }
    }
  }

  const envPath = join(target, '.env');
  const pgUrl = `postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${dbName}?schema=public`;
  if (existsSync(envPath)) {
    let e = readFileSync(envPath, 'utf-8');
    e = e.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${pgUrl}"`);
    writeFileSync(envPath, e);
  }

  const servicePath = join(target, 'src', 'prisma', 'prisma.service.ts');
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

  const seedPath = join(target, 'prisma', 'seed.ts');
  if (existsSync(seedPath)) {
    let seedContent = readFileSync(seedPath, 'utf-8');
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
    if (seedContent.includes(oldBlock)) {
      seedContent = seedContent.replace(oldBlock, newBlock);
      writeFileSync(seedPath, seedContent);
    }
  }

  const pkgPath2 = join(target, 'package.json');
  if (existsSync(pkgPath2)) {
    const p = JSON.parse(readFileSync(pkgPath2, 'utf-8'));
    const deps = p.dependencies || {};
    delete deps['@prisma/adapter-better-sqlite3'];
    delete deps['better-sqlite3'];
    delete deps['@types/better-sqlite3'];
    deps['@prisma/adapter-pg'] = '^7.8.0';
    deps['pg'] = '^8.20.0';
    deps['@types/pg'] = '^8.20.0';
    p.dependencies = deps;
    writeFileSync(pkgPath2, JSON.stringify(p, null, 2) + '\n');
  }
}

// ─── Custom spinner frames ─────────────────────────────

const barFrames = {
  interval: 120,
  frames: [
    '□ □ □ □ □',
    '■ □ □ □ □',
    '■ ■ □ □ □',
    '■ ■ ■ □ □',
    '■ ■ ■ ■ □',
    '■ ■ ■ ■ ■',
  ],
};

const pulseFrames = {
  interval: 120,
  frames: ['◉ ○ ○', '○ ◉ ○', '○ ○ ◉', '○ ◉ ○'],
};

// ─── Step runner ───────────────────────────────────────

let _stepCount = 0;
let _totalSteps = 0;

function initStepCounter(total) {
  _stepCount = 0;
  _totalSteps = total;
}

function runStep(label, fn, opts = {}) {
  _stepCount++;
  const stepStr = pc.dim(`[${_stepCount}/${_totalSteps}]`);
  const spinner = ora({
    text: `${stepStr} ${label}`,
    spinner: opts.spinner || 'dots',
    color: 'cyan',
  }).start();

  const start = hrtime.bigint();
  const result = { ok: false, data: null, error: null };

  try {
    const data = fn();
    if (data && typeof data.then === 'function') {
      return data.then(res => {
        spinner.succeed(`${stepStr} ${pc.green('✔')} ${label}  ${pc.dim(elapsed(start))}`);
        result.ok = true;
        result.data = res;
        return result;
      }).catch(err => {
        spinner.fail(`${stepStr} ${pc.red('✖')} ${label}  ${pc.dim(elapsed(start))}`);
        result.error = err;
        throw err;
      });
    }
    spinner.succeed(`${stepStr} ${pc.green('✔')} ${label}  ${pc.dim(elapsed(start))}`);
    result.ok = true;
    result.data = data;
    return result;
  } catch (err) {
    spinner.fail(`${stepStr} ${pc.red('✖')} ${label}  ${pc.dim(elapsed(start))}`);
    result.error = err;
    throw err;
  }
}

async function runStepAsync(label, asyncFn, opts = {}) {
  _stepCount++;
  const stepStr = pc.dim(`[${_stepCount}/${_totalSteps}]`);
  const spinner = ora({
    text: `${stepStr} ${label}`,
    spinner: opts.spinner || 'dots',
    color: 'cyan',
  }).start();

  const start = hrtime.bigint();

  try {
    const data = await asyncFn();
    spinner.succeed(`${stepStr} ${pc.green('✔')} ${label}  ${pc.dim(elapsed(start))}`);
    return { ok: true, data, error: null };
  } catch (err) {
    spinner.fail(`${stepStr} ${pc.red('✖')} ${label}  ${pc.dim(elapsed(start))}`);
    throw err;
  }
}

function skipStep(label) {
  _stepCount++;
  const stepStr = pc.dim(`[${_stepCount}/${_totalSteps}]`);
  console.log(`${stepStr} ${pc.yellow('→')} ${label}  ${pc.dim('skipped')}`);
}

// ─── Banner ────────────────────────────────────────────

const BANNER_RAW =
  '╔═══════════════════════════════════════╗\n' +
  '║       Create Base NestJS App          ║\n' +
  '╚═══════════════════════════════════════╝';

function showBanner() {
  console.log();
  console.log(gradient('cyan', 'magenta')(BANNER_RAW));
  console.log(pc.dim(`                        v${pkg.version}`));
  console.log();
}

function showHelpBanner() {
  console.log(gradient('cyan', 'magenta')(
    '╔═══════════════════════════════════════╗\n' +
    '║       Create Base NestJS App          ║\n' +
    '╚═══════════════════════════════════════╝'
  ));
  console.log(pc.dim(`                        v${pkg.version}`));
}

// ─── Box ───────────────────────────────────────────────

function showBox(lines, opts = {}) {
  const color = opts.color || 'cyan';
  const normal = lines;
  const width = Math.max(...normal.map(l => l.length));
  const pad = 2;
  const bw = width + pad * 2;

  console.log('  ' + pc[color]('┌' + '─'.repeat(bw) + '┐'));
  for (const line of normal) {
    const rp = bw - line.length - pad;
    console.log('  ' + pc[color]('│') + ' '.repeat(pad) + line + ' '.repeat(rp) + pc[color]('│'));
  }
  console.log('  ' + pc[color]('└' + '─'.repeat(bw) + '┘'));
}

// ─── Parse args ────────────────────────────────────────

const args = argv.slice(2);
const flags = {
  yes: args.includes('--yes') || args.includes('-y'),
  help: args.includes('--help') || args.includes('-h'),
  version: args.includes('--version') || args.includes('-v'),
  jwtSecret: args.includes('--jwt-secret') || args.includes('-j'),
  pg: args.includes('--pg') || args.includes('--postgres'),
  setupPg: args.includes('--setup-pg'),
};
let argProjectName = args.find(a => !a.startsWith('-') && a !== '--pg' && a !== '--postgres' && a !== '--setup-pg');

if (flags.version) {
  console.log(pkg.version);
  exit(0);
}

if (flags.jwtSecret) {
  const secret = generateSecret();
  console.log();
  console.log(pc.bold('  JWT Secret:'));
  console.log();
  console.log(`  ${pc.cyan('JWT_SECRET')}=${secret}`);
  console.log(`  ${pc.cyan('JWT_REFRESH_SECRET')}=${generateSecret()}`);
  console.log();
  console.log(`  ${pc.dim('Copy these values into your .env file.')}`);
  console.log();
  exit(0);
}

if (flags.setupPg) {
  const projectDir = cwd();
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    console.error(pc.red('✖ Not a project directory (no package.json found)'));
    exit(1);
  }
  const name = basename(projectDir);
  console.log();
  console.log(pc.cyan(`  Setting up PostgreSQL for "${name}"...`));
  console.log();
  setupPostgres(projectDir, name);
  console.log();
  console.log(pc.cyan('  Installing PostgreSQL dependencies...'));
  execSync('npm install', { cwd: projectDir, stdio: 'pipe', timeout: 120000 });
  console.log(pc.green('  ✔ PostgreSQL setup complete!'));
  console.log();
  console.log(`  ${pc.dim('Next:')}  ${pc.cyan('npx prisma migrate dev')}`);
  console.log();
  exit(0);
}

if (flags.help) {
  showHelpBanner();
  console.log();
  console.log(`  ${pc.bold('Usage:')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs')} ${pc.green('<project-name>')} ${pc.yellow('[options]')}`);
  console.log();
  console.log(`  ${pc.bold('Options:')}`);
  console.log(`    ${pc.yellow('-y, --yes')}           Use default project name`);
  console.log(`    ${pc.yellow('--pg, --postgres')}    Use PostgreSQL instead of SQLite`);
  console.log(`    ${pc.yellow('--setup-pg')}          Switch existing project to PostgreSQL`);
  console.log(`    ${pc.yellow('-j, --jwt-secret')}    Generate a secure JWT secret`);
  console.log(`    ${pc.yellow('-h, --help')}           Show this help`);
  console.log(`    ${pc.yellow('-v, --version')}        Show version`);
  console.log();
  console.log(`  ${pc.bold('Examples:')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs my-api')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs my-api --pg')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs --pg my-api')}  (PostgreSQL)`);
  console.log(`    ${pc.cyan('npx create-base-nestjs --setup-pg')}   (in existing project)`);
  console.log(`    ${pc.cyan('npx create-base-nestjs --jwt-secret')}`);
  console.log();
  exit(0);
}

showBanner();

// ─── Project name ──────────────────────────────────────

let projectName = argProjectName;

if (!projectName) {
  if (flags.yes) {
    projectName = 'my-nest-api';
  } else {
    const response = await prompts({
    type: 'text',
    name: 'value',
    message: 'Project name:',
    initial: 'my-nest-api',
    validate: (val) => {
      const result = validateProjectName(val);
      if (result !== true) return result;
      if (existsSync(resolve(cwd(), val.trim()))) {
        return `Directory "${val.trim()}" already exists`;
      }
      return true;
    },
  }, {
    onCancel: () => { console.log(pc.red('\n✖ Cancelled')); exit(1); },
  });

  projectName = response.value.trim();
  }
}

const targetDir = resolve(cwd(), projectName);

if (existsSync(targetDir)) {
  if (flags.yes) {
    console.log(pc.yellow(`  ⚠ Removing existing directory "${projectName}"...`));
    removeRecursive(targetDir);
  } else {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'value',
      message: `Directory "${projectName}" already exists. Overwrite?`,
      initial: false,
    }, {
      onCancel: () => { console.log(pc.red('\n✖ Cancelled')); exit(1); },
    });

    if (!overwrite) {
      console.log(pc.red('  ✖ Aborted'));
      exit(1);
    }

    console.log(pc.yellow(`  ⚠ Removing existing directory "${projectName}"...`));
    removeRecursive(targetDir);
  }
}

console.log();

// ─── Steps ─────────────────────────────────────────────

console.log();

const totalSteps = 5 + (flags.pg ? 1 : 0);
initStepCounter(totalSteps);

// ── Step 1: Download ──
await runStepAsync('Downloading template', async () => {
  const emitter = degit('robyajo/base-nest', {
    cache: false,
    force: true,
    verbose: false,
  });
  await emitter.clone(targetDir);
}, { spinner: barFrames });

// ── Step 2: Prepare ──
await runStepAsync('Preparing project', async () => {
  const templateFilesToRemove = [
    'bin',
    '.agents',
    'AGENTS.md',
    'progress.txt',
    'docs-server.js',
    'ecosystem.config.js',
    'nginx.conf',
    'release.sh',
  ];

  for (const file of templateFilesToRemove) {
    const full = join(targetDir, file);
    if (existsSync(full)) {
      if (isDir(full)) removeRecursive(full);
      else rmSync(full);
    }
  }

  const pkgPath = join(targetDir, 'package.json');
  const projectPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  projectPkg.name = basename(targetDir);
  projectPkg.version = '0.0.1';
  projectPkg.private = true;
  projectPkg.description = projectPkg.description || 'NestJS backend project';

  if (projectPkg.devDependencies) {
    projectPkg.dependencies = { ...projectPkg.dependencies, ...projectPkg.devDependencies };
    delete projectPkg.devDependencies;
  }

  const cliDeps = ['degit', 'prompts', 'picocolors', 'ora', 'gradient-string'];
  for (const dep of cliDeps) {
    delete projectPkg.dependencies?.[dep];
  }

  delete projectPkg.bin;
  delete projectPkg.files;

  const ordered = {};
  for (const key of Object.keys(projectPkg).sort()) {
    ordered[key] = projectPkg[key];
  }

  writeFileSync(pkgPath, JSON.stringify(ordered, null, 2) + '\n');

  // Copy .env.example → .env and inject secrets
  const envExamplePath = join(targetDir, '.env.example');
  const envPath = join(targetDir, '.env');
  if (existsSync(envExamplePath)) {
    let envContent = readFileSync(envExamplePath, 'utf-8');
    envContent = envContent
      .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${generateSecret()}`)
      .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${generateSecret()}`);
    writeFileSync(envPath, envContent);
  }
});

// ── Step 2b: PostgreSQL (optional) ──
if (flags.pg) {
  await runStepAsync('Configuring PostgreSQL', async () => {
    setupPostgres(targetDir, basename(targetDir));
  });
}

// ── Step 3: Install ──
await runStepAsync('Installing dependencies', async () => {
  execSync('npm install', { cwd: targetDir, stdio: 'pipe', timeout: 300000 });
}, { spinner: pulseFrames });

// ── Step 4: Generate Prisma client ──
await runStepAsync('Generating Prisma client', async () => {
  execSync('npx prisma generate', { cwd: targetDir, stdio: 'pipe', timeout: 60000 });
});

// ── Step 5: Git init ──
await runStepAsync('Initializing git repository', async () => {
  execSync('git init && git add -A && git commit -m "chore: scaffold from base-nest template"', {
    cwd: targetDir,
    stdio: 'pipe',
    timeout: 30000,
  });
});

// ─── Final output ──────────────────────────────────────

console.log();

showBox([
  pc.green(pc.bold('  ✔  Project created successfully!')),
  '',
  pc.dim('  Next steps:'),
  '',
  `  ${pc.cyan('cd')} ${projectName}`,
  `  ${pc.cyan('npx prisma migrate dev')}`,
  `  ${pc.cyan('npm run start:dev')}`,
  '',
  pc.dim('  📖  ') + pc.dim('github.com/robyajo/base-nest'),
], { color: 'cyan' });

console.log();
