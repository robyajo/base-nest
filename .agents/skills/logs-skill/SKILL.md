---
name: logs-skill
description: Standar pengelolaan logging aplikasi, audit trail (LoginLog), error monitoring (NestJS Logger & PM2), dan pencatatan riwayat progres AI agent di ekosistem base-nest.
license: MIT
compatibility: opencode
metadata:
  audience: backend-engineers, ai-agents
---

# 📋 Logs & Monitoring Skill (`base-nest`)

Skill ini mendefinisikan standar, pola, dan aturan wajib dalam pengelolaan log aplikasi, pelacakan error, audit keamanan, serta **pencatatan riwayat progres pengembangan oleh AI Agent** dalam ekosistem **`base-nest`** (NestJS 11 + Prisma v7 + PostgreSQL).

---

## What I do

- Tambahkan log dari setiap tugas, perbaikan, atau fitur yang sudah dikerjakan ke dalam file `progress.txt`.
- Memastikan implementasi standar logging aplikasi (NestJS Logger, Prisma LoginLog, PM2) dipatuhi secara konsisten di seluruh kode.

## When to use me

- Setelah selesai membuat file baru, melakukan refactor, menjalankan task, atau memperbaiki bug.
- Setiap kali ada modifikasi atau perubahan kode apa pun dalam repositori.

## How I do it

1. **Read `progress.txt`**: Selalu baca `progress.txt` terlebih dahulu untuk melihat entri log terakhir.
2. **Append Entry Baru**: Tambahkan entri log baru di bagian paling bawah file.
3. **Group Berdasarkan Tanggal**: Kelompokkan entri di bawah tanggal saat ini (`## [YYYY-MM-DD]`), menggunakan *bullet points*.
4. **Gunakan Format Standar**: Format wajib berupa `[Aksi] nama/file - deskripsi singkat`.

---

## Log Format (`progress.txt`)

```txt
## [YYYY-MM-DD]
- [Aksi] jalur/file - deskripsi singkat
- [Aksi] jalur/file - deskripsi singkat
```

### Contoh Penulisan Log:

```txt
## [2026-05-18]
- [Modified] src/modules/auth/auth.service.ts - menambahkan logika pencatatan riwayat login via recordLoginAttempt
- [Created] .agents/skills/logs-skill/SKILL.md - membuat standar dokumentasi log dan panduan pencatatan progres AI
```

### Daftar Format Aksi Wajib:

```txt
Modified
Created
Fixed
Deleted
Moved
Updated
Added
Implemented
Refactor
```

> **🚨 PENTING:** Selalu *append* (tambahkan di bawah), dilarang keras melakukan *overwrite* yang menghapus riwayat log sebelumnya!

---

## 1. Tujuan & Ruang Lingkup Aplikasi

1. **Akurasi & Visibilitas**: Memastikan seluruh aktivitas krusial sistem (HTTP requests, autentikasi, query database, dan error) terekam secara terstruktur.
2. **Audit Trail Keamanan**: Mengelola pencatatan riwayat login user secara persisten di database untuk keperluan deteksi anomali dan investigasi keamanan.
3. **Standarisasi Output**: Menyeragamkan format log baik di console saat development (NestJS Logger) maupun file log saat production (PM2).

---

## 2. Standar Logging Aplikasi (NestJS Logger)

Seluruh komponen dalam aplikasi wajib menggunakan `Logger` bawaan dari `@nestjs/common` dengan menyertakan nama kelas sebagai *context*. **Dilarang keras menggunakan `console.log`**.

### Tingkatan Log (Log Levels)
- **`error`**: Kesalahan sistem kritis, unhandled exception, kegagalan koneksi database atau integrasi eksternal (SMTP, OAuth).
- **`warn`**: Kondisi tidak wajar namun tidak menghentikan sistem (contoh: rate limit tercapai, token kedaluwarsa).
- **`log` (Info)**: Informasi alur kerja normal (contoh: server berjalan, koneksi database berhasil, job selesai).
- **`debug`**: Data diagnostik mendalam untuk keperluan penelusuran masalah (aktif di mode development).
- **`verbose`**: Informasi alur eksekusi paling detail (seperti payload mentah HTTP).

### Contoh Implementasi di Service & Controller
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuthService {
  // Inisialisasi logger dengan context nama kelas
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateUser(email: string) {
    this.logger.debug(`Memvalidasi user dengan email: ${email}`);

    try {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        this.logger.warn(`User tidak ditemukan: ${email}`);
      }
      return user;
    } catch (error) {
      this.logger.error(`Gagal melakukan query user ${email}`, error.stack);
      throw error;
    }
  }
}
```

---

## 3. Audit Trail & Riwayat Login (`LoginLog`)

Setiap aktivitas autentikasi (login via email/password maupun OAuth Google & Discord) wajib dicatat dalam tabel `LoginLog` menggunakan `PrismaService`.

### Aturan Pencatatan Audit:
1. **Login Sukses**: Catat `userId`, `ipAddress`, `userAgent`, dan set `isSuccess: true`.
2. **Login Gagal**: Catat informasi percobaan login, set `isSuccess: false`, dan isi `failureReason` (misal: `"Password salah"`, `"Akun belum terverifikasi"`, `"Email tidak terdaftar"`).

### Contoh Implementasi Audit Logging:
```typescript
async recordLoginAttempt(
  userId: string | null,
  ipAddress: string,
  userAgent: string,
  isSuccess: boolean,
  failureReason?: string,
): Promise<void> {
  try {
    await this.prisma.loginLog.create({
      data: {
        userId,
        ipAddress,
        userAgent,
        isSuccess,
        failureReason,
      },
    });
    this.logger.log(`Audit Login [${isSuccess ? 'SUKSES' : 'GAGAL'}]: IP ${ipAddress}`);
  } catch (err) {
    this.logger.error('Gagal mencatat audit log ke database', err.stack);
  }
}
```

---

## 4. Error Handling & Global Exception Logging

Aplikasi menggunakan filter eksepsi global (`HttpExceptionFilter`) dan pencegat respons (`ResponseInterceptor`) untuk menstandarisasi output dan log.

### Alur Penanganan Kesalahan:
1. Ketika terjadi kesalahan/exception, `HttpExceptionFilter` akan menangkap exception tersebut.
2. Filter **wajib** mencatat detail error ke logger dengan level `error`, menyertakan *stack trace*, HTTP method, path URL, serta IP pemohon.
3. Filter mengonversi error menjadi respons JSON terstruktur dengan format:
   ```json
   {
     "success": false,
     "message": "Pesan kesalahan ramah pengguna",
     "error": {
       "code": "HTTP_STATUS_CODE",
       "details": "Detail teknis jika di mode development"
     }
   }
   ```
4. **Penanganan Khusus Kesalahan Prisma**:
   - Kode error `P2002` (Unique constraint) wajib dilog sebagai peringatan/error dan dikonversi menjadi `ConflictException` (409).
   - Kode error `P2025` (Record not found) dikonversi menjadi `NotFoundException` (404).

---

## 5. Monitoring Production (PM2 & Nginx)

Pada lingkungan production, NestJS dijalankan melalui manajer proses **PM2** sesuai dengan konfigurasi pada `ecosystem.config.js`.

### Pengelolaan Log PM2:
- Output standar `stdout` dan `stderr` dikelola otomatis oleh PM2 dan disimpan pada direktori log server (secara default `~/.pm2/logs/`).
- Untuk memantau log secara langsung (*real-time*):
  ```bash
  # Melihat seluruh log aplikasi
  pm2 logs base-nest --lines 100

  # Melihat dashboard pemantauan real-time
  pm2 monit
  ```
- **Rotasi Log (Log Rotation)**: Sangat disarankan memasang modul `pm2-logrotate` agar file log tidak membebani kapasitas disk server.

### Pengelolaan Log Nginx:
Jika Nginx digunakan sebagai *reverse proxy* (berdasarkan `nginx.conf`), log lalu lintas jaringan dapat diperiksa pada:
- **Access Log**: `/var/log/nginx/access.log`
- **Error Log**: `/var/log/nginx/error.log`

---

## 6. Standar Penulisan Kode & Log oleh AI Agent

Selain mencatat di `progress.txt`, setiap AI Agent yang memodifikasi aplikasi wajib mematuhi:

1. **Gunakan Log Level yang Tepat**: Saat membuat service/controller baru, pastikan setiap logika utama (CRUD, autentikasi, integrasi eksternal) dilengkapi dengan `this.logger` yang representatif.
2. **Patuhi Zod & Exception Filter**: Jangan menangani error secara mentah menggunakan respons Express (`res.status(...).send(...)`). Biarkan eksepsi dilempar (`throw new HttpException(...)`) agar ditangkap dan dilog oleh filter global.
3. **Pencatatan Perubahan Database**:
   - Jika mengubah skema database di `prisma/models/*.prisma`, pastikan menyertakan deskripsi yang jelas saat menjalankan migrasi (`npx prisma migrate dev --name <deskripsi_jelas>`).
