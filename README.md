# create-base-nestjs

Scaffold a production-ready **NestJS 11** backend with authentication (JWT + OAuth2), Prisma ORM, and more.

```bash
npx create-base-nestjs my-project
cd my-project
cp .env.example .env
npx prisma migrate dev
npm run start:dev
```

---

## Quick Start

```bash
npx create-base-nestjs <project-name>
```

You'll be prompted to confirm install & git init. Use `--yes` to skip prompts:

```bash
npx create-base-nestjs my-project --yes
```

### Options

| Flag | Description |
|---|---|
| `-y, --yes` | Skip prompts, use defaults |
| `-h, --help` | Show help |
| `-v, --version` | Show CLI version |

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

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | - | PostgreSQL connection |
| `JWT_SECRET` | Yes | - | JWT access token secret |
| `JWT_REFRESH_SECRET` | Yes | - | JWT refresh token secret |
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
