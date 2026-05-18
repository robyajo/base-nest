# create-base-nestjs

Scaffold a production-ready **NestJS 11** backend with authentication (JWT + OAuth2), Prisma ORM, and more.

```bash
npx create-base-nestjs my-project
cd my-project
npx prisma migrate dev
npm run start:dev
```

> `.env` otomatis dibuat dari `.env.example` dengan `JWT_SECRET` dan `JWT_REFRESH_SECRET` acak.

---

## Quick Start

```bash
npx create-base-nestjs <project-name>
```

Project langsung siap pakai — `npm install`, `git init`, dan `.env` dengan JWT secrets random sudah otomatis.

```bash
npx create-base-nestjs my-project --yes   # pakai default nama "my-nest-api"
```

### Options

| Flag | Description |
|---|---|
| `-y, --yes` | Use default project name |
| `-j, --jwt-secret` | Generate secure JWT secret (`JWT_SECRET` + `JWT_REFRESH_SECRET`) |
| `-h, --help` | Show help |
| `-v, --version` | Show CLI version |

### Generate JWT Secret Manual

Butuh secret baru tanpa buat project? Gunakan `--jwt-secret`:

```bash
npx create-base-nestjs --jwt-secret

# Output:
#   JWT_SECRET=d6c341fde02724dc2ce6da0eaad099bbb8a2544538726b9b2f99681b7f6b8404
#   JWT_REFRESH_SECRET=babf6c138a49c2ac91a1606ee302a68fdc775e986d7ef519c91f8658e1797385
```

Cocok untuk mengganti secret di project yang sudah ada, atau generate ulang jika secret bocor.

---

## What You Get

A NestJS backend with:

| Category | Features |
|---|---|
| **Auth** | Register/Login (bcrypt), JWT access + refresh token, Google OAuth2, Discord OAuth2 |
| **Users** | Profile (bio, social), avatar upload (Multer), RBAC (USER / ADMIN), email verification |
| **Security** | Global JWT guard (`@Public()` bypass), Roles guard (RBAC), email cooldown, token revoke (logout/logout-all) |
| **API** | Structured response `{ success, message, data }`, global exception filter, Zod validation, CORS |
| **Email** | Nodemailer SMTP, branded verification & reset password templates |
| **Database** | Prisma ORM v7, PostgreSQL, modular schema, PrismaPg adapter |
| **Real-time** | Socket.IO ready |
| **Events** | `@nestjs/event-emitter` for event-driven architecture |

### Project Structure

```
src/
├── main.ts                      # Entry point
├── app.module.ts                # Root module
├── config/                      # ConfigModule global (@nestjs/config)
├── prisma/                      # PrismaModule global (PrismaClient + adapter)
├── common/
│   ├── decorators/              # @Public(), @CurrentUser(), @Roles()
│   ├── filters/                 # HttpExceptionFilter
│   ├── guards/                  # JwtAuthGuard, RolesGuard
│   ├── interceptors/            # ResponseInterceptor
│   ├── interfaces/              # ApiResponse, JwtPayload
│   └── pipes/                   # ZodValidationPipe
└── modules/
    ├── auth/                    # Auth (controller, service, strategies)
    └── mail/                    # Mail (Nodemailer)
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Register |
| `POST` | `/api/v1/auth/login` | Public | Login |
| `POST` | `/api/v1/auth/refresh` | Public | Refresh token |
| `POST` | `/api/v1/auth/logout` | Bearer | Revoke refresh token |
| `POST` | `/api/v1/auth/logout-all` | Bearer | Revoke all sessions |
| `GET` | `/api/v1/auth/me` | Bearer | Current user profile |
| `PATCH` | `/api/v1/auth/profile` | Bearer | Update profile + avatar |
| `POST` | `/api/v1/auth/send-verification` | Bearer | Send verification email |
| `GET` | `/api/v1/auth/verify-email` | Public | Verify email |
| `POST` | `/api/v1/auth/forgot-password` | Public | Forgot password |
| `POST` | `/api/v1/auth/reset-password` | Public | Reset password |
| `POST` | `/api/v1/auth/change-password` | Bearer | Change password |
| `GET` | `/api/v1/auth/google` | Public | Google OAuth redirect |
| `GET` | `/api/v1/auth/google/callback` | Public | Google OAuth callback |
| `GET` | `/api/v1/auth/discord` | Public | Discord OAuth redirect |
| `GET` | `/api/v1/auth/discord/callback` | Public | Discord OAuth callback |

---

## Environment Variables

> `JWT_SECRET` dan `JWT_REFRESH_SECRET` otomatis di-generate saat scaffolding.  
> Untuk generate manual: `npx create-base-nestjs --jwt-secret`

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection |
| `JWT_SECRET` | Yes | (auto) | JWT access token secret |
| `JWT_REFRESH_SECRET` | Yes | (auto) | JWT refresh token secret |
| `PORT` | No | `8000` | App port |
| `JWT_ACCESS_EXPIRY` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token TTL |
| `APP_URL` | No | `http://localhost:8000` | App base URL |
| `CORS_ORIGIN` | No | `*` | CORS origin |
| `CLIENT_URL` | No | `http://localhost:8000` | Frontend URL |
| `GOOGLE_CLIENT_ID` | Optional | - | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Optional | - | Google OAuth |
| `GOOGLE_CALLBACK_URL` | Optional | - | Google OAuth |
| `DISCORD_CLIENT_ID` | Optional | - | Discord OAuth |
| `DISCORD_CLIENT_SECRET` | Optional | - | Discord OAuth |
| `DISCORD_CALLBACK_URL` | Optional | - | Discord OAuth |
| `MAIL_HOST` | Optional | - | SMTP host |
| `MAIL_PORT` | Optional | - | SMTP port |
| `MAIL_USER` | Optional | - | SMTP user |
| `MAIL_PASS` | Optional | - | SMTP password |
| `MAIL_FROM` | Optional | - | SMTP from address |

---

## Prisma

```bash
npx prisma migrate dev --name <change>
npx prisma migrate deploy       # Production
npx prisma db seed              # Seed data
npx prisma studio               # GUI browser
```

Models: `User`, `Profile`, `ApiToken`, `RefreshToken`, `VerificationToken`, `LoginLog`, `Post`, `Category`.

---

## Development

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run start:dev        # http://localhost:8000
npm run build
npm test
npm run lint
```

---

## Deployment

```bash
npm run build
node dist/main
```

PM2 config and Nginx reverse proxy example are included (`ecosystem.config.js`, `nginx.conf`).

---

## GitHub Template

This repo is also a [GitHub template](https://github.com/robyajo/base-nest/generate) — click **"Use this template"** to create a new repo without the CLI.
