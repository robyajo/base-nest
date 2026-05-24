import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { cwd } from 'node:process';

const VALID_NAME = /^[a-z][a-z0-9-]*$/;

export function toPascalCase(str) {
  return str
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

export function validateModuleName(name) {
  if (!name || !name.trim()) return 'Module name is required';
  if (!VALID_NAME.test(name.trim()))
    return 'Module name must start with a letter and contain only lowercase letters, numbers, and hyphens';
  return null;
}

export function generateModule(moduleName, opts = {}) {
  const Name = toPascalCase(moduleName);
  const created = [];

  const moduleDir = resolve(cwd(), 'src', 'modules', moduleName);
  if (existsSync(moduleDir)) {
    return { ok: false, error: `Module "${moduleName}" already exists at src/modules/${moduleName}` };
  }

  mkdirSync(moduleDir, { recursive: true });

  const files = {
    [`${moduleName}.module.ts`]: generateModuleFile(moduleName, Name),
    [`${moduleName}.controller.ts`]: generateControllerFile(moduleName, Name),
    [`${moduleName}.service.ts`]: generateServiceFile(moduleName, Name),
  };

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(moduleDir, filename), content);
    created.push(`src/modules/${moduleName}/${filename}`);
  }

  const appModulePath = resolve(cwd(), 'src', 'app.module.ts');
  if (existsSync(appModulePath)) {
    updateAppModule(appModulePath, moduleName, Name);
  }

  if (opts.withModel) {
    const modelDir = resolve(cwd(), 'prisma', 'models');
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true });
    }
    const modelFile = `${moduleName}.prisma`;
    writeFileSync(join(modelDir, modelFile), generatePrismaModelFile(moduleName, Name));
    created.push(`prisma/models/${modelFile}`);

    try {
      execSync(`npx prisma migrate dev --name add_${moduleName}`, {
        cwd: cwd(),
        stdio: 'pipe',
        timeout: 120000,
      });
      created.push(`prisma/migrations/ - migration "add_${moduleName}" created & applied`);
    } catch (err) {
      return {
        ok: false,
        files: created,
        migrationError: `Migration failed: ${err.stderr?.toString() || err.message}`,
      };
    }
  }

  return {
    ok: true,
    files: created,
  };
}

function generateModuleFile(name, Name) {
  return `import { Module } from '@nestjs/common';
import { ${Name}Controller } from './${name}.controller';
import { ${Name}Service } from './${name}.service';

@Module({
  controllers: [${Name}Controller],
  providers: [${Name}Service],
  exports: [${Name}Service],
})
export class ${Name}Module {}
`;
}

function generateControllerFile(name, Name) {
  return `import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ${Name}Service } from './${name}.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('api/v1/${name}')
export class ${Name}Controller {
  constructor(private readonly ${name}Service: ${Name}Service) {}

  @Public()
  @Get()
  async findAll() {
    return this.${name}Service.findAll();
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.${name}Service.findOne(id);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: Record<string, unknown>) {
    return this.${name}Service.create(dto);
  }

  @Public()
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.${name}Service.update(id, dto);
  }

  @Public()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.${name}Service.remove(id);
  }
}
`;
}

function generateServiceFile(name, Name) {
  return `import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ${Name}Service {
  private readonly logger = new Logger(${Name}Service.name);

  async findAll() {
    return [];
  }

  async findOne(id: string) {
    return { id };
  }

  async create(dto: Record<string, unknown>) {
    return dto;
  }

  async update(id: string, dto: Record<string, unknown>) {
    return { id, ...dto };
  }

  async remove(id: string) {
    return { id };
  }
}
`;
}

function generatePrismaModelFile(name, Name) {
  return `model ${Name} {
    id        String   @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
`;
}

function updateAppModule(appModulePath, name, Name) {
  let content = readFileSync(appModulePath, 'utf-8');

  const importLine = `import { ${Name}Module } from './modules/${name}/${name}.module';`;
  if (content.includes(importLine)) return;

  const moduleRef = `${Name}Module`;

  const insertImportAfter = "import { PrismaModule }";
  const importPos = content.indexOf(insertImportAfter);
  if (importPos !== -1) {
    const lineEnd = content.indexOf('\n', importPos);
    content =
      content.slice(0, lineEnd + 1) + importLine + '\n' + content.slice(lineEnd + 1);
  }

  const importsMatch = content.match(/imports:\s*\[([\s\S]*?)\]/);
  if (importsMatch) {
    const fullMatch = importsMatch[0];
    const importsBody = importsMatch[1];
    const prismaIdx = importsBody.lastIndexOf('PrismaModule');
    if (prismaIdx !== -1) {
      const before = importsBody.slice(0, prismaIdx).replace(/,\s*$/, '');
      const after = importsBody.slice(prismaIdx);
      const newBody = before ? `${before}, ${moduleRef},\n    ${after}` : `${moduleRef}, ${after}`;
      content = content.replace(fullMatch, `imports: [${newBody}]`);
    }
  }

  writeFileSync(appModulePath, content);
}
