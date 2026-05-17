# Base Nest

Proyek backend NestJS modular dengan autentikasi lengkap (JWT + OAuth2), Prisma ORM, dan fitur pendukung.

## Fitur

| Kategori | Fitur |
|---|---|
| **Autentikasi** | Register/Login email + password (bcrypt), JWT access & refresh token, Google OAuth2, Discord OAuth2 |
| **Manajemen User** | Profil (bio, sosial media), upload avatar (multer), role-based access (USER / ADMIN), verifikasi email |
| **Keamanan** | Global JWT guard (`@Public()` untuk bypass), Roles guard (RBAC), cooldown verifikasi email, revoke token (logout/logout-all) |
| **API** | Response format terstruktur (`{ success, message, data }`), global exception filter, validasi Zod, CORS enabled |
| **Email** | SMTP via Nodemailer, template email verifikasi & reset password (branded "VYNIX") |
| **Database** | Prisma ORM v7, PostgreSQL, modular schema, PrismaPg adapter dengan native pg.Pool |
| **Real-time** | Socket.IO platform terpasang (siap pakai) |
| **Event** | Event emitter (`@nestjs/event-emitter`) untuk arsitektur berbasis event |

## Persyaratan Sistem

- **Node.js** >= 18.x
- **npm** >= 9.x
- **PostgreSQL** >= 14
- **Git**

## Cara Clone & Setup

```bash
# 1. Clone repositori
git clone <repository-url> base-nest
cd base-nest

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env .env.local

# 4. Edit .env.local sesuai environment Anda
#    Database, JWT secret, OAuth credentials, SMTP dll.
#    Minimal: atur DATABASE_URL dan JWT_SECRET

# 5. Setup database & jalankan migrasi
npx prisma migrate dev

# 6. (Opsional) Seeder data awal
npx prisma db seed

# 7. Generate Prisma Client (jika migrate dev tidak otomatis)
npx prisma generate

# 8. Jalankan development server
npm run start:dev
```

Akses di **http://localhost:8000**

---

## Environment Variables

| Variable | Wajib | Default | Deskripsi |
|---|---|---|---|
| `DATABASE_URL` | Ya | - | Koneksi PostgreSQL (`postgresql://user:pass@host:5432/db?schema=public`) |
| `PORT` | Tidak | `8000` | Port aplikasi |
| `JWT_SECRET` | Ya | - | Secret key untuk JWT access token |
| `JWT_REFRESH_SECRET` | Ya | - | Secret key untuk JWT refresh token |
| `JWT_ACCESS_EXPIRY` | Tidak | `15m` | Masa berlaku access token |
| `JWT_REFRESH_EXPIRY` | Tidak | `7d` | Masa berlaku refresh token |
| `APP_URL` | Tidak | `http://localhost:8000` | Base URL aplikasi |
| `CORS_ORIGIN` | Tidak | `*` | Origin yang diizinkan CORS |
| `CLIENT_URL` | Tidak | `http://localhost:8000` | URL frontend |
| `GOOGLE_CLIENT_ID` | Opsional | - | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Opsional | - | Google OAuth Client Secret |
| `GOOGLE_CALLBACK_URL` | Opsional | - | Google OAuth callback |
| `DISCORD_CLIENT_ID` | Opsional | - | Discord OAuth Client ID |
| `DISCORD_CLIENT_SECRET` | Opsional | - | Discord OAuth Client Secret |
| `DISCORD_CALLBACK_URL` | Opsional | - | Discord OAuth callback |
| `MAIL_HOST` | Opsional | - | SMTP host |
| `MAIL_PORT` | Opsional | - | SMTP port |
| `MAIL_USER` | Opsional | - | SMTP user |
| `MAIL_PASS` | Opsional | - | SMTP password |
| `MAIL_FROM` | Opsional | - | Alamat pengirim email |

> **Catatan:** OAuth & Mail bersifat opsional. Tanpa konfigurasi, fitur login Google/Discord dan pengiriman email tidak akan aktif.

---

## Prisma ORM

Proyek ini menggunakan **Prisma ORM v7** dengan PostgreSQL, diatur melalui `prisma.config.ts`.

### Struktur Prisma

```
prisma/
├── schema.prisma          # Generator & datasource
├── prisma.config.ts       # Konfigurasi Prisma (koneksi, migrasi, seed)
├── models/
│   ├── users.prisma       # Model User, Profile, ApiToken, RefreshToken, VerificationToken, LoginLog
│   └── posts.prisma       # Model Post, Category
├── migrations/            # Riwayat migrasi database
│   └── 20260517192844_init/
├── seed.ts                # Data awal (seeder)
```

> Prisma v7 menggunakan **modular schema** (`models/` folder) — model dipisah per file dan digabung otomatis.

### Prisma Client

Prisma Client ditempatkan di `generated/prisma/` (sudah di `.gitignore`). Di dalam kode, import dari `generated/prisma/client`:

```typescript
import { PrismaClient } from 'generated/prisma/client';
```

Proyek menggunakan `PrismaPg` adapter (`@prisma/adapter-pg`) dengan native `pg.Pool` untuk koneksi:

```typescript
// src/prisma/prisma.service.ts
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
```

### Perintah Prisma Dasar

```bash
# Membuat migrasi baru setelah mengubah schema
npx prisma migrate dev --name deskripsi_perubahan

# Menjalankan migrasi ke production
npx prisma migrate deploy

# Reset database (hapus semua data + migrasi, mulai ulang)
npx prisma migrate reset

# Generate Prisma Client (setelah install atau update schema)
npx prisma generate

# Melihat data di Prisma Studio (GUI browser)
npx prisma studio

# Menjalankan seeder
npm run seed
# atau
npx prisma db seed

# Format file prisma
npx prisma format
```

### Model-Model

| Model | Deskripsi |
|---|---|
| `User` | User utama, mendukung registrasi email & OAuth (Google/Discord) |
| `Profile` | Profil user (bio, sosial media) — relasi one-to-one dengan User |
| `ApiToken` | API token untuk akses programatik |
| `RefreshToken` | Refresh token untuk memperbarui access token |
| `VerificationToken` | Token verifikasi email & reset password |
| `LoginLog` | Riwayat login user |
| `Post` | Artikel/postingan — relasi many-to-one dengan User |
| `Category` | Kategori postingan — relasi many-to-many dengan Post |
| `UserRole` | Enum: `USER`, `ADMIN` |

### Menggunakan PrismaService di Aplikasi

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SomeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany();
  }

  async create(data: { username: string; email: string }) {
    return this.prisma.user.create({ data });
  }
}
```

`PrismaService` adalah `@Global()` — tersedia di semua module tanpa perlu import module.

---

## Scripts NPM

| Script | Deskripsi |
|---|---|
| `npm run start:dev` | Development dengan hot-reload |
| `npm run build` | Build ke `dist/` |
| `npm run start:prod` | Menjalankan build production (`node dist/main`) |
| `npm run lint` | ESLint fix |
| `npm run format` | Prettier format |
| `npm test` | Unit test (Jest) |
| `npm run test:e2e` | E2E test |
| `npm run seed` | Menjalankan Prisma seeder |

---

## Struktur Proyek

```
src/
├── main.ts                    # Entry point
├── app.module.ts              # Root module
├── config/
│   └── config.module.ts       # ConfigModule global (.env)
├── prisma/
│   ├── prisma.module.ts       # PrismaModule global
│   └── prisma.service.ts      # PrismaClient + adapter
├── common/
│   ├── decorators/            # @Public(), @CurrentUser(), @Roles()
│   ├── filters/               # HttpExceptionFilter
│   ├── guards/                # JwtAuthGuard, RolesGuard
│   ├── interceptors/          # ResponseInterceptor
│   ├── interfaces/            # ApiResponse, JwtPayload dll.
│   └── pipes/                 # ZodValidationPipe
└── modules/
    ├── auth/                  # Auth module (controller, service, strategies)
    └── mail/                  # Mail module (Nodemailer)
```

---

## API Endpoints

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public | Registrasi user baru |
| `POST` | `/api/v1/auth/login` | Public | Login email/password |
| `POST` | `/api/v1/auth/refresh` | Public | Refresh token |
| `POST` | `/api/v1/auth/logout` | Bearer | Logout (revoke refresh token) |
| `POST` | `/api/v1/auth/logout-all` | Bearer | Logout semua session |
| `GET` | `/api/v1/auth/me` | Bearer | Profil user saat ini |
| `PATCH` | `/api/v1/auth/profile` | Bearer | Update profil + avatar |
| `POST` | `/api/v1/auth/send-verification` | Bearer | Kirim email verifikasi |
| `GET` | `/api/v1/auth/verify-email` | Public | Verifikasi email |
| `POST` | `/api/v1/auth/forgot-password` | Public | Lupa password |
| `POST` | `/api/v1/auth/reset-password` | Public | Reset password |
| `POST` | `/api/v1/auth/change-password` | Bearer | Ganti password |
| `GET` | `/api/v1/auth/google` | Public | Redirect Google OAuth |
| `GET` | `/api/v1/auth/google/callback` | Public | Callback Google OAuth |
| `GET` | `/api/v1/auth/discord` | Public | Redirect Discord OAuth |
| `GET` | `/api/v1/auth/discord/callback` | Public | Callback Discord OAuth |

---

## Deployment

### Production Build

```bash
npm run build
node dist/main
```

Proyek ini menyertakan konfigurasi untuk **PM2** dan **Nginx** (lihat file `ecosystem.config.js` dan `nginx.conf` di root).

### PM2

```bash
# Install PM2 global
npm install -g pm2

# Jalankan dengan PM2
pm2 start ecosystem.config.js

# Atau manual
pm2 start dist/main.js --name base-nest

# Status
pm2 status
pm2 logs base-nest

# Restart
pm2 restart base-nest
```

### Nginx

Lihat file `nginx.conf` untuk konfigurasi reverse proxy. Sesuaikan `server_name` dan `proxy_pass` dengan environment Anda.
