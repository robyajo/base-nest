# bns — Agent instructions

## Stack
- **NestJS 11** (Express platform), single package (not monorepo)
- **Prisma v7** ORM with PostgreSQL, modular schema (`prisma/models/*.prisma`)
- **Auth**: JWT + Passport, global `JwtAuthGuard` with `@Public()` bypass; Google & Discord OAuth2
- **Validation**: Zod schemas + `ZodValidationPipe` in every controller
- **Response**: structured `{ success, message, data }` via global `ResponseInterceptor`
- **Config**: `@nestjs/config` global (loads `.env`); `ConfigModule` and `PrismaModule` are `@Global()`
- **Real-time**: Socket.IO (`@nestjs/platform-socket.io`), Event emitter (`@nestjs/event-emitter`)

## Key commands
| Command | Purpose |
|---|---|
| `npm run start:dev` | Dev server with hot-reload (port 8000, set in `.env`) |
| `npm run build` | Build to `dist/` (`deleteOutDir: true`) |
| `npm run lint` | ESLint fix (flat config, `sourceType: 'commonjs'`) |
| `npm run format` | Prettier (singleQuote, trailingComma: all) |
| `npm test` | Jest unit tests (`*.spec.ts` in `src/`) |
| `npm run test:e2e` | E2E tests (`test/*.e2e-spec.ts`, config `test/jest-e2e.json`) |
| `npx prisma migrate dev --name <change>` | Create migration after schema change |
| `npx prisma db seed` | Run seeder (`tsx prisma/seed.ts`) |

> **Note**: `npm run seed` does **not** exist in `package.json` despite being listed in README. Use `npx prisma db seed` instead.

## Codebase quirks
- **Import paths**: Use `src/...` prefixes (e.g. `import { Public } from 'src/common/decorators/public.decorator'`), not relative
- **Prisma client**: Generated at `generated/prisma/client` (CJS module format), already in `.gitignore`; enums are at `generated/prisma/enums`
- **Global guards**: `JwtAuthGuard` + `RolesGuard` registered as `APP_GUARD` in `AppModule`; mark public routes with `@Public()`, restrict roles with `@Roles(UserRole.ADMIN)`
- **File uploads**: Multer via `FileInterceptor`, stored in `uploads/{userId}/avatars/`, served at `/uploads/` via `app.useStaticAssets`
- **Exception filter**: Global `HttpExceptionFilter` has Multer-specific error handling with hardcoded field names for profile updates
- **TS config**: `module: nodenext` + `moduleResolution: nodenext`, `noImplicitAny: false`, `strictNullChecks: true`
- **ESLint**: Flat config, `@typescript-eslint/no-explicit-any: 'off'`, `prettier/prettier` rule has `endOfLine: auto`
- **No spec files exist yet** — only `test/app.e2e-spec.ts`

## Architecture
- **Entry**: `src/main.ts` -> `AppModule` imports `ConfigModule`, `PrismaModule`, `AuthModule`, `MailModule`
- **Modules**: `auth/` (controller, service, strategies, schemas, guards), `mail/` (service, module)
- **Common**: `decorators/`, `guards/`, `interceptors/`, `filters/`, `pipes/`, `interfaces/`
- **Endpoints**: All under `/api/v1/auth/` (see README for full table)

## Deployment
- PM2 via `ecosystem.config.js` (NODE_ENV=production, port 8000)
- Nginx reverse proxy config at `nginx.conf`
- Docs server: `node docs-server.js` (port 4000, serves markdown from `docs/`)
