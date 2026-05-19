# create-bns-api

Scaffold a production-ready **NestJS 11** backend with authentication (JWT + OAuth2), Prisma ORM, and more.

```bash
npx create-bns-api my-project
cd my-project
npx prisma migrate dev
npm run start:dev
```

> `.env` otomatis dibuat dari `.env.example` dengan `JWT_SECRET` dan `JWT_REFRESH_SECRET` acak.

---

## Quick Start

```bash
npx create-bns-api <project-name>
```

Project langsung siap pakai — `npm install`, `git init`, dan `.env` dengan JWT secrets random sudah otomatis.

> Jalankan via **Docker**: lihat [petunjuk lengkap](#docker) di bawah.

```bash
npx create-bns-api my-project           # Default: SQLite
npx create-bns-api my-project --pg      # PostgreSQL (user: postgres, password: 123)
npx create-bns-api --yes                # Skip prompts, nama default "my-nest-api"
```

### Switch ke PostgreSQL Setelah Project Dibuat

```bash
cd my-project
npx create-bns-api --setup-pg
# Semua dikonfigurasi otomatis: schema, adapter, .env, deps
```

### Upgrade Project Existing ke Versi Template Terbaru

```bash
cd existing-project
npx create-bns-api --upgrade
```

Proses upgrade akan:
1. Download template versi terbaru
2. Membandingkan struktur file project saat ini dengan template baru
3. Menampilkan daftar **file baru** yang akan ditambahkan, **file berubah** (dengan tingkat kesamaan/kemiripan), dan **file yang tidak ada di template**
4. **⚠ Menampilkan peringatan khusus** jika ada file yang akan ditimpa dengan perubahan besar (*breaking changes*) — misal file `.ts`, `.prisma`, atau `.json` dengan kesamaan kode di bawah 60%
5. Menambahkan file baru, menimpa file yang berubah, menggabungkan dependensi baru
6. Menambahkan key environment variable baru (tanpa menghapus yang sudah ada)
7. `npm install` + `npx prisma generate` otomatis
8. Membuat file `.bns-version` sebagai penanda versi template

> ⚠ **Peringatan:** File dengan perubahan besar akan ditimpa. Selalu `git commit` atau backup sebelum upgrade, dan review perubahan dengan `git diff` setelah selesai.

### Options

| Flag | Description |
|---|---|
| `-y, --yes` | Use default project name |
| `--pg, --postgres` | Use PostgreSQL instead of SQLite |
| `--setup-pg` | Switch existing project to PostgreSQL |
| `--upgrade` | Upgrade existing project to latest template version |
| `-j, --jwt-secret` | Generate secure JWT secret |
| `-h, --help` | Show help |
| `-v, --version` | Show CLI version |

### Generate JWT Secret Manual

Butuh secret baru tanpa buat project? Gunakan `--jwt-secret`:

```bash
npx create-bns-api --jwt-secret

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
> Untuk generate manual: `npx create-bns-api --jwt-secret`

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | `file:./dev.db` | SQLite (default) / PostgreSQL connection |
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
| `REDIS_HOST` | No | `localhost` | Redis host (BullMQ / Socket.IO) |
| `REDIS_PORT` | No | `6379` | Redis port |

---

## Prisma

Default menggunakan **SQLite** — langsung jalan tanpa setup database.  
Untuk **PostgreSQL**, gunakan flag `--pg` saat scaffolding, atau jalankan `npx create-bns-api --setup-pg` di project yang sudah ada.

Perintah Prisma:

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
cp .env.example .env         # opsional, CLI sudah otomatis bikin
npx prisma migrate dev
npm run start:dev             # http://localhost:8000
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

## Docker

Project dilengkapi `Dockerfile` dan `docker-compose.yml` untuk menjalankan semua service (app, PostgreSQL, Redis) dalam container.

### Prasyarat

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (bawaan Docker Desktop)

### Menjalankan Aplikasi

```bash
# Build & start semua service
docker compose up -d

# Lihat log aplikasi
docker compose logs -f app

# Hentikan service
docker compose down
```

### Service dalam `docker-compose.yml`

| Service | Image | Port | Fungsi |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | `5432` | Database PostgreSQL |
| `redis` | `redis:7-alpine` | `6379` | In-memory store (BullMQ / Socket.IO) |
| `app` | build dari `Dockerfile` | `8000` | NestJS API |

### Environment Variables untuk Docker

Semua environment variable bisa di-override melalui file `.env` di root project. Contoh:

```env
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
APP_URL=http://localhost:8000
CORS_ORIGIN=*
```

> Jika file `.env` tidak ada, nilai *default* dari `docker-compose.yml` akan dipakai.

### Migrasi Database di Docker

```bash
# Jalankan migrasi di dalam container app
docker compose exec app npx prisma migrate dev

# Atau via Prisma Studio (akses di http://localhost:5555)
docker compose exec app npx prisma studio --port 5555 --host 0.0.0.0
```

### Build Ulang Setelah Perubahan Kode

Setiap kali ada perubahan kode, rebuild image app:

```bash
docker compose up -d --build app
```

### Volume Persisten

| Volume | Mount | Kegunaan |
|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` | Data database |
| `redis_data` | `/data` | Data Redis |
| `app_uploads` | `/app/uploads` | File upload user |

---

## GitHub Template

This repo is also a [GitHub template](https://github.com/robyajo/bns/generate) — click **"Use this template"** to create a new repo without the CLI.
