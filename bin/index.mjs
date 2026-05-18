#!/usr/bin/env node

import degit from 'degit';
import prompts from 'prompts';
import pc from 'picocolors';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, basename } from 'node:path';
import { argv, exit, cwd, version as nodeVersion } from 'node:process';

const __dirname = new URL('.', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
if (nodeMajor < 18) {
  console.error(pc.red(`✖ Node.js >= 18 is required. Current: ${nodeVersion}`));
  exit(1);
}

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
    return 'Project name must be a valid npm package name (lowercase, hyphens allowed)';
  }
  return true;
}

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
  console.log(`
${pc.bold('create-base-nestjs')} v${pkg.version}
${pc.dim('Scaffold a new NestJS backend project with auth, Prisma ORM, and more')}

${pc.dim('Usage:')}
  ${pc.cyan('npx create-base-nestjs')} ${pc.green('<project-name>')} ${pc.yellow('[options]')}

${pc.dim('Options:')}
  ${pc.yellow('-y, --yes')}          Use defaults for all prompts
  ${pc.yellow('-h, --help')}         Show this help
  ${pc.yellow('-v, --version')}      Show version number

${pc.dim('Examples:')}
  ${pc.cyan('npx create-base-nestjs my-api')}
  ${pc.cyan('npx create-base-nestjs --yes')}
`);
  exit(0);
}

console.log();
console.log(pc.bold(pc.cyan('  ╔═══════════════════════════════════════╗')));
console.log(pc.bold(pc.cyan('  ║       Create Base NestJS App         ║')));
console.log(pc.bold(pc.cyan('  ╚═══════════════════════════════════════╝')));
console.log();

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
    console.log(pc.yellow(`⚠ Removing existing directory "${projectName}"...`));
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
      console.log(pc.red('✖ Aborted'));
      exit(1);
    }

    console.log(pc.yellow(`⚠ Removing existing directory "${projectName}"...`));
    removeRecursive(targetDir);
  }
}

console.log();
const downloadSpinner = ora('Downloading template...').start();

try {
  const emitter = degit('robyajo/base-nest', {
    cache: false,
    force: true,
    verbose: false,
  });

  await emitter.clone(targetDir);
  downloadSpinner.succeed('Template downloaded');
} catch (err) {
  downloadSpinner.fail('Failed to download template');
  console.error(pc.red(err.message));
  exit(1);
}

const cleanupSpinner = ora('Preparing project...').start();

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
let projectPkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

projectPkg.name = basename(targetDir);
projectPkg.version = '0.0.1';
projectPkg.private = true;
projectPkg.description = projectPkg.description || 'NestJS backend project';

if (projectPkg.devDependencies) {
  projectPkg.dependencies = { ...projectPkg.dependencies, ...projectPkg.devDependencies };
  delete projectPkg.devDependencies;
}

const cliDeps = ['degit', 'prompts', 'picocolors', 'ora'];
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

cleanupSpinner.succeed('Project prepared');

let installDeps = flags.yes;
if (!flags.yes) {
  const { install } = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Install dependencies?',
    initial: true,
  }, {
    onCancel: () => { console.log(pc.red('\nSkipped')); installDeps = false; },
  });
  installDeps = install;
}

if (installDeps) {
  const installSpinner = ora('Installing dependencies...').start();
  try {
    execSync('npm install', { cwd: targetDir, stdio: 'pipe', timeout: 300000 });
    installSpinner.succeed('Dependencies installed');
  } catch {
    installSpinner.fail('Failed to install dependencies');
    console.log(pc.yellow('  You can run "npm install" manually in the project directory.'));
  }
}

let initGit = flags.yes;
if (!flags.yes) {
  const { git } = await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Initialize a git repository?',
    initial: true,
  }, {
    onCancel: () => { console.log(pc.red('\nSkipped')); initGit = false; },
  });
  initGit = git;
}

if (initGit) {
  const gitSpinner = ora('Initializing git repository...').start();
  try {
    execSync('git init && git add -A && git commit -m "chore: scaffold from base-nest template"', {
      cwd: targetDir,
      stdio: 'pipe',
      timeout: 30000,
    });
    gitSpinner.succeed('Git repository initialized');
  } catch {
    gitSpinner.fail('Failed to initialize git repository');
    console.log(pc.yellow('  You can run "git init" manually in the project directory.'));
  }
}

console.log();
console.log(pc.green(pc.bold('  ✔ Project created successfully!')));
console.log();
console.log(`  ${pc.dim('Next steps:')}`);
console.log();
console.log(`    ${pc.cyan('cd')} ${projectName}`);
if (!installDeps) console.log(`    ${pc.cyan('npm install')}`);
console.log(`    ${pc.cyan('cp .env.example .env')}`);
console.log(`    ${pc.cyan('# Edit .env with your configuration')}`);
console.log(`    ${pc.cyan('npx prisma migrate dev')}`);
console.log(`    ${pc.cyan('npm run start:dev')}`);
console.log();
console.log(`  ${pc.dim('Documentation:')}  https://github.com/robyajo/base-nest`);
console.log();
