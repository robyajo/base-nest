#!/usr/bin/env node

import degit from 'degit';
import prompts from 'prompts';
import pc from 'picocolors';
import ora from 'ora';
import gradient from 'gradient-string';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, existsSync, rmSync, statSync, readdirSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, basename, dirname } from 'node:path';
import { argv, exit, cwd, version as nodeVersion, hrtime, platform } from 'node:process';
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

function countOverlap(a, b) {
  const len = Math.min(a.length, b.length);
  let match = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) match++;
  }
  return match;
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
  upgrade: args.includes('--upgrade'),
};
const SKIP_ARGS = ['--pg', '--postgres', '--setup-pg', '--upgrade'];
let argProjectName = args.find(a => !a.startsWith('-') && !SKIP_ARGS.includes(a));

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

// ─── Upgrade ──────────────────────────────────────────────

const UPGRADE_TEMPLATE_REPO = 'robyajo/base-nest';
const UPGRADE_MARKER_FILE = '.base-nest-version';

if (flags.upgrade) {
  await doUpgrade();
}

function getTemplateVersion() {
  try {
    const p = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
    return p.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function getProjectVersion(projectDir) {
  try {
    const markerPath = join(projectDir, UPGRADE_MARKER_FILE);
    if (existsSync(markerPath)) {
      return readFileSync(markerPath, 'utf-8').trim();
    }
  } catch {}
  return null;
}

function listFilesRecursive(dir, prefix = '') {
  const entries = [];
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'generated') continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      try {
        if (statSync(full).isDirectory()) {
          entries.push(...listFilesRecursive(full, rel));
        } else {
          entries.push(rel);
        }
      } catch {}
    }
  } catch {}
  return entries;
}

async function doUpgrade() {
  const projectDir = cwd();
  const pkgPath = join(projectDir, 'package.json');

  if (!existsSync(pkgPath)) {
    console.error(pc.red('\n  ✖ Not a project directory (no package.json found)'));
    exit(1);
  }

  const projectPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const projectName = basename(projectDir);

  showBanner();

  console.log();
  console.log(`  ${pc.cyan('Upgrading:')}  ${pc.bold(projectName)}`);
  console.log(`  ${pc.cyan('Target:')}    ${pc.bold(getTemplateVersion())}`);
  const oldVer = getProjectVersion(projectDir);
  if (oldVer) {
    console.log(`  ${pc.cyan('From:')}      ${pc.yellow(oldVer)}`);
  }
  console.log();

  // Step 1: Download latest template
  const tmpDir = mkdtempSync(join(platform === 'win32' ? (process.env.TEMP || 'C:\\Temp') : '/tmp', 'base-nest-upgrade-'));
  const barSpinner = ora({ text: pc.dim('[1/4]') + ' Downloading latest template', spinner: barFrames, color: 'cyan' }).start();

  try {
    const emitter = degit(UPGRADE_TEMPLATE_REPO, { cache: false, force: true, verbose: false });
    await emitter.clone(tmpDir);
    barSpinner.succeed(pc.green('✔') + ` ${pc.dim('[1/4]')} Downloading latest template`);
  } catch (err) {
    barSpinner.fail(pc.red('✖') + ` ${pc.dim('[1/4]')} Downloading latest template`);
    console.error(pc.red(`\n  ✖ Failed to download template: ${err.message}`));
    removeRecursive(tmpDir);
    exit(1);
  }

  // Step 2: Compare files
  const spinner2 = ora({ text: pc.dim('[2/4]') + ' Analyzing file changes', color: 'cyan' }).start();

  const templateFiles = listFilesRecursive(tmpDir);
  const projectFiles = new Set(listFilesRecursive(projectDir));

  const newFiles = [];
  const conflictingFiles = [];
  const removedFromTemplate = [];

  for (const f of templateFiles) {
    if (f.startsWith('bin/') || f === UPGRADE_MARKER_FILE || f === '.env.example' || f.endsWith('.db') || f.endsWith('.db-journal') || f.includes('node_modules/') || f.startsWith('generated/')) {
      continue;
    }
    if (!projectFiles.has(f)) {
      const src = join(tmpDir, f);
      const dest = join(projectDir, f);
      try {
        const content = readFileSync(src, 'utf-8');
        newFiles.push({ path: f, content, dest });
      } catch { newFiles.push({ path: f, content: null, dest }); }
    } else {
      const src = join(tmpDir, f);
      const dest = join(projectDir, f);
      try {
        const oldContent = readFileSync(dest, 'utf-8');
        const newContent = readFileSync(src, 'utf-8');
        if (oldContent !== newContent) {
          const SIMILARITY_THRESHOLD = 0.6;
          const overlap = countOverlap(oldContent, newContent);
          const maxLen = Math.max(oldContent.length, newContent.length);
          const similarity = maxLen > 0 ? overlap / maxLen : 1;
          const isBreaking = f.endsWith('.ts') || f.endsWith('.prisma') || f.endsWith('.json');
          conflictingFiles.push({
            path: f,
            oldContent,
            newContent,
            similarity,
            isBreaking: isBreaking && similarity < SIMILARITY_THRESHOLD,
          });
        }
      } catch {}
    }
  }

  for (const f of projectFiles) {
    if (f === 'package-lock.json' || f === '.env' || f.startsWith('.git/') || f.startsWith('node_modules/') || f.startsWith('generated/') || f === UPGRADE_MARKER_FILE || f === '.env.example' || f.endsWith('.db') || f.endsWith('.db-journal') || f.startsWith('uploads/') || f.startsWith('prisma/migrations/')) {
      continue;
    }
    if (!templateFiles.includes(f)) {
      removedFromTemplate.push(f);
    }
  }

  spinner2.succeed(pc.green('✔') + ` ${pc.dim('[2/4]')} Analyzing file changes`);

  // ─── Summary ──
  console.log();
  if (newFiles.length > 0) {
    console.log(`  ${pc.green('+')} ${pc.bold(newFiles.length)} new files will be added`);
    for (const f of newFiles.slice(0, 10)) {
      console.log(`    ${pc.green('+')} ${f.path}`);
    }
    if (newFiles.length > 10) console.log(`    ${pc.dim(`...and ${newFiles.length - 10} more`)}`);
  }

  if (conflictingFiles.length > 0) {
    const breaking = conflictingFiles.filter(f => f.isBreaking);
    const safe = conflictingFiles.filter(f => !f.isBreaking);
    if (breaking.length > 0) {
      console.log(`\n  ${pc.red('⚠')} ${pc.red(pc.bold(breaking.length))} files with ${pc.bold('BREAKING')} changes:`);
      for (const f of breaking) {
        console.log(`    ${pc.red('⚠')} ${f.path} ${pc.dim(`(${(f.similarity * 100).toFixed(0)}% match)`)}`);
      }
    }
    if (safe.length > 0) {
      console.log(`\n  ${pc.yellow('~')} ${pc.yellow(pc.bold(safe.length))} files with minor changes (safe):`);
      for (const f of safe) {
        console.log(`    ${pc.yellow('~')} ${f.path}`);
      }
    }
  }

  if (removedFromTemplate.length > 0) {
    console.log(`\n  ${pc.dim('-')} ${pc.dim(pc.bold(removedFromTemplate.length))} files exist in project but not in template:`);
    for (const f of removedFromTemplate) {
      console.log(`    ${pc.dim('-')} ${f}`);
    }
  }

  if (newFiles.length === 0 && conflictingFiles.length === 0) {
    console.log(`  ${pc.green('✔ Project is up-to-date!')}`);
    removeRecursive(tmpDir);
    exit(0);
  }

  console.log();

  // ─── Warning for breaking changes ──
  const hasBreaking = conflictingFiles.some(f => f.isBreaking);
  if (hasBreaking) {
    console.log();
    console.log(pc.bgRed(pc.white('  WARNING  ')) + pc.red(' This upgrade may affect your existing code.'));
    console.log(pc.red('  Files marked with ⚠ will be overwritten if you proceed.'));
    console.log(pc.red('  Make sure to backup or commit your changes first.'));
    console.log();
  }

  // ─── Confirmation ──
  const { proceed } = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Proceed with upgrade?',
    initial: false,
  }, { onCancel: () => { console.log(pc.red('\n  ✖ Cancelled')); removeRecursive(tmpDir); exit(1); } });

  if (!proceed) {
    console.log(pc.red('  ✖ Cancelled'));
    removeRecursive(tmpDir);
    exit(0);
  }

  // Step 3: Apply changes
  const spinner3 = ora({ text: pc.dim('[3/4]') + ' Applying upgrade', color: 'cyan' }).start();

  // 3a: Add new files
  for (const f of newFiles) {
    const destDir = resolve(projectDir, dirname(f.path));
    if (!existsSync(destDir)) {
      try { mkdirSync(destDir, { recursive: true }); } catch {}
    }
    try {
      const stat = statSync(join(tmpDir, f.path));
      if (stat.isDirectory()) {
        if (!existsSync(f.dest)) mkdirSync(f.dest, { recursive: true });
      } else if (f.content !== null) {
        writeFileSync(f.dest, f.content);
      } else {
        copyFileSync(join(tmpDir, f.path), f.dest);
      }
    } catch {}
  }

  // 3b: Overwrite conflicting files
  for (const f of conflictingFiles) {
    try {
      writeFileSync(join(projectDir, f.path), f.newContent);
    } catch {}
  }

  // 3c: Update package.json — merge deps from template
  const tmpPkgPath = join(tmpDir, 'package.json');
  if (existsSync(tmpPkgPath)) {
    const templatePkg = JSON.parse(readFileSync(tmpPkgPath, 'utf-8'));
    const merged = { ...projectPkg };
    for (const depType of ['dependencies', 'devDependencies']) {
      if (templatePkg[depType]) {
        merged[depType] = { ...(merged[depType] || {}), ...templatePkg[depType] };
      }
    }
    const cliDeps2 = ['degit', 'prompts', 'picocolors', 'ora', 'gradient-string'];
    for (const dep of cliDeps2) {
      delete merged.dependencies?.[dep];
      delete merged.devDependencies?.[dep];
    }
    writeFileSync(pkgPath, JSON.stringify(merged, null, 2) + '\n');
  }

  // 3d: Write version marker
  writeFileSync(join(projectDir, UPGRADE_MARKER_FILE), getTemplateVersion());

  // 3e: Sync .env.example changes (add missing keys only)
  const tmpEnvExample = join(tmpDir, '.env.example');
  const projectEnvExample = join(projectDir, '.env.example');
  const projectEnv = join(projectDir, '.env');
  if (existsSync(tmpEnvExample)) {
    const tmpEnvContent = readFileSync(tmpEnvExample, 'utf-8');
    const tmpLines = tmpEnvContent.split('\n').filter(l => l.includes('=') && !l.startsWith('#'));
    const tmpKeys = new Set(tmpLines.map(l => l.split('=')[0].trim()));

    if (existsSync(projectEnv)) {
      let envContent = readFileSync(projectEnv, 'utf-8');
      const envLines = envContent.split('\n');
      const envKeys = new Set(envLines.filter(l => l.includes('=') && !l.startsWith('#')).map(l => l.split('=')[0].trim()));
      for (const key of tmpKeys) {
        if (!envKeys.has(key)) {
          const tmpVal = tmpLines.find(l => l.startsWith(key + '='));
          if (tmpVal) {
            envContent += `\n${tmpVal}`;
          }
        }
      }
      writeFileSync(projectEnv, envContent);
    }

    if (existsSync(projectEnvExample)) {
      let exampleContent = readFileSync(projectEnvExample, 'utf-8');
      const exampleLines = exampleContent.split('\n');
      const exampleKeys = new Set(exampleLines.filter(l => l.includes('=') && !l.startsWith('#')).map(l => l.split('=')[0].trim()));
      for (const key of tmpKeys) {
        if (!exampleKeys.has(key)) {
          const tmpVal = tmpLines.find(l => l.startsWith(key + '='));
          if (tmpVal) {
            exampleContent += `\n${tmpVal}`;
          }
        }
      }
      writeFileSync(projectEnvExample, exampleContent);
    }
  }

  spinner3.succeed(pc.green('✔') + ` ${pc.dim('[3/4]')} Applying upgrade`);

  // Step 4: Install & generate
  const spinner4 = ora({ text: pc.dim('[4/4]') + ' Installing dependencies', color: 'cyan' }).start();

  try {
    execSync('npm install', { cwd: projectDir, stdio: 'pipe', timeout: 300000 });
    spinner4.text = pc.dim('[4/4]') + ' Installing dependencies';
    spinner4.succeed(pc.green('✔') + ` ${pc.dim('[4/4]')} Installing dependencies`);
  } catch {
    spinner4.fail(pc.red('✖') + ` ${pc.dim('[4/4]')} Installing dependencies`);
  }

  const spinner4b = ora({ text: pc.dim('[4/4]') + ' Generating Prisma client', color: 'cyan' }).start();
  try {
    execSync('npx prisma generate', { cwd: projectDir, stdio: 'pipe', timeout: 60000 });
    spinner4b.succeed(pc.green('✔') + ` ${pc.dim('[4/4]')} Generating Prisma client`);
  } catch {
    spinner4b.fail(pc.red('✖') + ` ${pc.dim('[4/4]')} Generating Prisma client`);
  }

  // Cleanup
  removeRecursive(tmpDir);

  console.log();

  if (hasBreaking) {
    showBox([
      pc.green(pc.bold('  ✔  Upgrade completed!')),
      '',
      pc.yellow('  ⚠  Some files were overwritten.'),
      pc.yellow('     Review changes with ' + pc.cyan('git diff') + ' before deploying.'),
    ], { color: 'yellow' });
  } else {
    showBox([
      pc.green(pc.bold('  ✔  Upgrade completed!')),
      '',
      pc.dim('  Your project is now up-to-date.'),
    ], { color: 'green' });
  }

  console.log();
  exit(0);
}

// ─── Help ────────────────────────────────────────────────

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
  console.log(`    ${pc.yellow('--upgrade')}           Upgrade existing project to latest template`);
  console.log(`    ${pc.yellow('-j, --jwt-secret')}    Generate a secure JWT secret`);
  console.log(`    ${pc.yellow('-h, --help')}           Show this help`);
  console.log(`    ${pc.yellow('-v, --version')}        Show version`);
  console.log();
  console.log(`  ${pc.bold('Examples:')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs my-api')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs my-api --pg')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs --pg my-api')}  (PostgreSQL)`);
  console.log(`    ${pc.cyan('npx create-base-nestjs --setup-pg')}   (in existing project)`);
  console.log(`    ${pc.cyan('npx create-base-nestjs --upgrade')}    (in existing project)`);
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
