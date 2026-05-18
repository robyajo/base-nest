#!/usr/bin/env node

import degit from 'degit';
import prompts from 'prompts';
import pc from 'picocolors';
import ora from 'ora';
import gradient from 'gradient-string';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, basename } from 'node:path';
import { argv, exit, cwd, version as nodeVersion, hrtime } from 'node:process';

const __dirname = new URL('.', import.meta.url).pathname;
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
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) removeRecursive(full);
    else rmSync(full);
  }
  rmSync(dir);
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

// ─── Custom spinner frames ─────────────────────────────

const barFrames = [
  '□ □ □ □ □',
  '■ □ □ □ □',
  '■ ■ □ □ □',
  '■ ■ ■ □ □',
  '■ ■ ■ ■ □',
  '■ ■ ■ ■ ■',
];

const pulseFrames = ['◉ ○ ○', '○ ◉ ○', '○ ○ ◉', '○ ◉ ○'];

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
};
let argProjectName = args.find(a => !a.startsWith('-'));

if (flags.version) {
  console.log(pkg.version);
  exit(0);
}

if (flags.help) {
  showHelpBanner();
  console.log();
  console.log(`  ${pc.bold('Usage:')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs')} ${pc.green('<project-name>')} ${pc.yellow('[options]')}`);
  console.log();
  console.log(`  ${pc.bold('Options:')}`);
  console.log(`    ${pc.yellow('-y, --yes')}     Use defaults for all prompts`);
  console.log(`    ${pc.yellow('-h, --help')}     Show this help`);
  console.log(`    ${pc.yellow('-v, --version')}  Show version`);
  console.log();
  console.log(`  ${pc.bold('Examples:')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs my-api')}`);
  console.log(`    ${pc.cyan('npx create-base-nestjs --yes')}`);
  console.log();
  exit(0);
}

showBanner();

// ─── Project name ──────────────────────────────────────

let projectName = argProjectName;

if (!projectName) {
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

let installDeps = flags.yes;
let initGit = flags.yes;

if (!flags.yes) {
  const { install } = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Install dependencies?',
    initial: true,
  }, {
    onCancel: () => { installDeps = false; },
  });
  installDeps = install;

  console.log();

  const { git } = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Initialize a git repository?',
    initial: true,
  }, {
    onCancel: () => { initGit = false; },
  });
  initGit = git;
}

console.log();

// Calculate total steps
const totalSteps = 2 + (installDeps ? 1 : 0) + (initGit ? 1 : 0);
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
});

// ── Step 3: Install (optional) ──
if (installDeps) {
  await runStepAsync('Installing dependencies', async () => {
    execSync('npm install', { cwd: targetDir, stdio: 'pipe', timeout: 300000 });
  }, { spinner: pulseFrames });
} else {
  skipStep('Installing dependencies');
}

// ── Step 4: Git init (optional) ──
if (initGit) {
  await runStepAsync('Initializing git repository', async () => {
    execSync('git init && git add -A && git commit -m "chore: scaffold from base-nest template"', {
      cwd: targetDir,
      stdio: 'pipe',
      timeout: 30000,
    });
  });
} else {
  skipStep('Initializing git repository');
}

// ─── Final output ──────────────────────────────────────

console.log();

showBox([
  pc.green(pc.bold('  ✔  Project created successfully!')),
  '',
  pc.dim('  Next steps:'),
  '',
  `  ${pc.cyan('cd')} ${projectName}`,
  ...(installDeps ? [] : [`  ${pc.cyan('npm install')}`]),
  `  ${pc.cyan('cp .env.example .env')}`,
  `  ${pc.dim('# Edit .env with your configuration')}`,
  `  ${pc.cyan('npx prisma migrate dev')}`,
  `  ${pc.cyan('npm run start:dev')}`,
  '',
  pc.dim('  📖  ') + pc.dim('github.com/robyajo/base-nest'),
], { color: 'cyan' });

console.log();
