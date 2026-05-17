# Panduan Sistem Listener Stream — Untuk Pemula NestJS

## 📌 Apa Itu NestJS?

Bayangkan NestJS seperti **kerangka rumah** yang sudah punya tiang, tembok, dan atap — kita tinggal pasang perabotan di dalamnya.

NestJS adalah **framework** untuk membuat aplikasi server (backend) pakai **TypeScript/JavaScript**.  
Dia punya konsep utama yang perlu kamu pahami:

| Konsep | Arti Sederhana | Analogi Restoran |
|--------|---------------|------------------|
| **Module** | Kotak organizer untuk mengelompokkan fitur | Setiap meja di restoran (meja 1, meja 2) |
| **Controller** | Penerima tamu / pelayan | Melayani order dari luar (API) |
| **Service** | Koki di dapur | Memasak / memproses data |
| **Gateway** | Pramusaji yang teriak ke semua tamu | WebSocket — kirim data realtime |
| **Provider** | Semua yang bisa "disuntikkan" | Bahan-bahan dapur yang bisa dipakai siapa saja |

> **"Dependency Injection"** = NestJS rajin banget. Dia otomatis nyambungin service A ke service B tanpa harus manual wiring. Kamu tinggal bilang "saya butuh ini" dan NestJS kasih.

---

## 🏗️ Struktur Sistem Ini (Listener Stream)

```
listener-stream/
├── src/
│   ├── main.ts                  # Gerbang masuk aplikasi
│   ├── app.module.ts            # Module utama (root)
│   ├── config/                  # Pengaturan env variable
│   ├── events/                  # Bus event internal
│   ├── gateways/                # WebSocket gateway
│   ├── modules/
│   │   ├── tiktok/              # ❤️ Fitur utama: koneksi TikTok Live
│   │   └── websocket/           # Module WebSocket (JWT)
│   ├── services/                # Service umum (Laravel API)
│   └── shared/                  # Konstanta bersama
└── shared/                      # (dulu dipakai, sekarang tidak)
```

---

## 🔄 Alur Data (Gampangnya Gimana?)

```
[Laravel (Frontend Admin)] 
        │ POST /api/internal/tiktok/connect
        ▼
┌─────────────────────────────────┐
│   TikTokController              │  ← Penerima perintah dari Laravel
│   (api/internal/tiktok/*)       │
└────────────┬────────────────────┘
             │ panggil service
             ▼
┌─────────────────────────────────┐
│   TikTokService                 │  ← Otak utama
│   • connect ke TikTok Live      │
│   • dengerin event (gift,chat)  │
│   • kirim event ke EventBus     │
└────────────┬────────────────────┘
             │ EventEmitter2 (event bus internal)
             ▼
┌─────────────────────────────────┐
│   WsEventHandler                │  ← Jembatan: EventBus → WebSocket
│   (denger event → kirim ke user)│
└────────────┬────────────────────┘
             │ panggil wsGateway.sendToUser()
             ▼
┌─────────────────────────────────┐
│   WsGateway                     │  ← Pintu WebSocket (Socket.IO)
│   • otentikasi pake JWT         │
│   • kirim event ke user/frontend│
└────────────┬────────────────────┘
             │ Socket.IO (realtime)
             ▼
        [Frontend / OBS / layar monitor]
```

---

## 📦 Module Demi Module (Penjelasan Awam)

### 1. `ConfigModule` — Pengaturan Aplikasi

Baca file `.env` dan siapkan variabel seperti:
- `PORT=9090` → aplikasi jalan di port 9090
- `JWT_SECRET=...` → kunci rahasia buat token
- `LARAVEL_URL` → alamat backend Laravel
- `LISTENER_API_KEY` → kunci akses dari Laravel

**Manfaat**: Semua rahasia (password, key) disimpan di `.env`, bukan di kode.

---

### 2. `TikTokModule` — ❤️ Jantung Sistem

Ini yang paling penting. Isinya 3 file:

#### a. `TikTokController` — Pelayan Restoran

Dia dengerin perintah dari Laravel (lewat HTTP POST):
- **POST `/api/internal/tiktok/connect`** — "Konekin aku ke TikTok live ini!"
- **POST `/api/internal/tiktok/disconnect`** — "Putusin koneksinya!"

Dia juga ngecek **API Key** — kaya kunci khusus dari Laravel, biar orang sembarangan gak bisa akses.

#### b. `TikTokService` — Koki Utama

Kerjaannya:
1. **connect()** — Colok ke live TikTok via library `tiktok-live-connector`
   - Punya **retry 3x** kalau gagal, dengan jeda makin lama
   - **Timeout 12 detik** — kalau gak konek dalam 12 detik, anggap gagal
   - Bisa pakai **proxy** dan **sessionId** untuk koneksi mobile
2. **Disconnect & cleanup** — Putus koneksi rapi-rapi
3. **Dengerin event TikTok**:
   - 💬 **COMMENT** — chat masuk
   - 🎁 **GIFT** — ada yang ngasih gift
   - ❤️ **LIKE** — like
   - 👥 **FOLLOW** — follow baru
   - 🔄 **SHARE** — share
   - 🏆 **BATTLE** — battle update
   - Dan lain-lain
4. **ingestEvent()** — setiap event yang masuk:
   - Dikirim ke **Laravel** (disimpan di database) — khusus GIFT & COMMENT
   - Dikirim ke **EventBus** (buat diteruskan ke WebSocket)
   - **Metadata dikumpulin** (jumlah viewer, like, diamond, dll — dikirim tiap 15 detik)

#### c. Tipe Data (`interfaces/tiktok.interface.ts`)

Definisi bentuk data yang dipake: bagaimana bentuk koneksi, status, dan event.

---

### 3. `EventBusModule` — Papan Pengumuman Internal

Ini pake `@nestjs/event-emitter` — adalah **papan pengumuman** di dalam aplikasi.

Cara kerjanya:
1. TikTokService **nempel pengumuman** (emit event) di papan:  
   `tiktok.event.ingested`, `tiktok.session.started`, dll.
2. WsEventHandler **dengerin** papan itu dan bereaksi

**Manfaat**: TikTokService gak perlu tahu cara kirim WebSocket. Dia cuma "teriak" di event bus, dan yang butuh akan denger sendiri. Ini bikin kode lebih rapi (decoupled).

---

### 4. `WsGateway` — Pengeras Suara ke Dunia Luar

Ini gateway **WebSocket** pake Socket.IO.

Fitur:
- **JWT Auth** — waktu client (frontend) nyambung, dia harus kirim token JWT
- Kalau token valid → client masuk room pribadi: `user:${userId}`
- Ada **2 method kirim**:
  - `sendToUser(userId, event, data)` — kirim ke 1 user tertentu
  - `sendToSession(sessionId, event, data)` — kirim ke session tertentu
- **CORS allow all** — biar bisa diakses dari mana aja

**Manfaat**: Begitu ada gift masuk di TikTok, dalam hitungan detik, frontend Langsung dapet notifikasi realtime tanpa perlu refresh halaman.

---

### 5. `WsEventHandler` — Penerjemah

Dia dengerin suara dari EventBus, lalu terjemahin ke WebSocket.

Contoh:
- TikTok ngirim event **"gift"** → EventBus bunyi → WsEventHandler denger → kirim ke WebSocket dengan nama event **"gift.created"**
- Session mulai → EventBus bunyi → WsEventHandler kirim **"live.started"**

**Mapping Event**:
| Event TikTok | Nama di EventBus | Nama di WebSocket |
|-------------|------------------|-------------------|
| Chat (COMMENT) | `tiktok.event.ingested` | `comment.created` |
| Gift (GIFT) | `tiktok.event.ingested` | `gift.created` |
| Follow (FOLLOW) | `tiktok.event.ingested` | `follow.created` |
| Live mulai | `tiktok.session.started` | `live.started` |
| Live selesai | `tiktok.session.ended` | `live.ended` |
| Error | `tiktok.error` | `tiktok:error` |

---

### 6. `LaravelService` — Jembatan ke Laravel

Ini service yang ngomong sama backend Laravel lewat HTTP.

Gunanya:
- `createSession()` — ngasih tahu Laravel: "ada live session baru nih"
- `updateSession()` — ngirim metadata (viewer, like, dll) tiap 15 detik
- `pushEvent()` — nyimpen event GIFT & COMMENT ke database Laravel
- `pushEvents()` — kirim banyak event sekaligus (batch)

**Manfaat**: Data event disimpan permanen di Laravel (database MySQL). Bisa dilihat history-nya.

---

## 🧠 Alur Lengkap (Cerita Sederhana)

**Cerita**: Admin klik "Connect" di dashboard → mau nonton live TikTok si A

1. **Laravel** kirim perintah ke `POST /api/internal/tiktok/connect`
2. **TikTokController** terima, cek API Key, trus panggil TikTokService
3. **TikTokService.connect()**:
   - Coba konek ke TikTok live A (retry 3x kalau gagal)
   - Pasang "pendengar" (listener) untuk setiap jenis event
   - Kirim event `tiktok.session.started` ke EventBus
   - Kirim event `tiktok.connected` ke EventBus
4. **WsEventHandler** denger kedua event itu → kirim ke WebSocket:
   - `live.started` ke user yang punya akun itu
   - `tiktok:connected` juga ke user
5. **Frontend (React/Next.js)** dapet notifikasi realtime: "Live sudah mulai!"
6. **Sekarang, setiap ada komen/gift**:
   - TikTokService denger → `ingestEvent()` dipanggil
   - Event dikirim ke EventBus (event `tiktok.event.ingested`)
   - Juga dikirim ke Laravel (khusus GIFT & COMMENT)
   - WsEventHandler denger → kirim ke WebSocket user
   - **Frontend langsung update** tanpa refresh!

7. **Kalau live selesai**:
   - TikTok disconnect → `handleDisconnect()` dipanggil
   - Session dihapus, metadata dikirim ke Laravel
   - Event `tiktok.session.ended` dikirim → user dapet `live.ended`

---

## 🛠️ Cara Jalanin & Script Penting

| Perintah | Gunanya |
|----------|---------|
| `npm run start:dev` | Jalanin server + auto restart kalau ada perubahan kode |
| `npm run build` | Compile TypeScript ke JavaScript (folder `dist/`) |
| `npm run start:prod` | Jalanin versi production |
| `npm run lint` | Cek dan perbaiki gaya penulisan kode |
| `npm test` | Jalanin unit test |

---

## 💡 Kenapa Pake NestJS? (Manfaat)

1. **Terstruktur** — Ada aturan jelas: controller, service, module. Gak campur aduk.
2. **TypeScript** — Otomatis ngecek tipe data. Error ketahuan sebelum jalan.
3. **Dependency Injection** — Koneksi otomatis. tinggal tulis di constructor, NestJS yang urus sisanya.
4. **Decorators** — Kode jadi lebih pendek dan ekspresif. Contoh: `@Controller()`, `@Post()`, `@WebSocketGateway()`.
5. **Modular** — Fitur dipisah per module. TikTok module gak perlu tahu cara kerja WebSocket module.
6. **Testing friendly** — Mudah ditest karena semua service bisa diganti (mock).
7. **Ecosystem besar** — Banyak library resmi: JWT, WebSocket, database, dll.
8. **WebSocket + HTTP dalam satu framework** — Gak perlu 2 server terpisah.

---

## 📊 Diagram Sederhana

```
┌──────────────┐     HTTP      ┌───────────────────┐
│   Laravel    │ ───────────►  │  TikTokController │
│  (Backend)   │ ◄───────────  │  (api/internal)   │
└──────────────┘     HTTP      └────────┬──────────┘
                                        │
                              ┌─────────▼──────────┐
                              │   TikTokService     │
                              │ (tiktok-live-conn.) │
                              └──┬──────┬──────┬───┘
                                 │      │      │
                    ┌────────────┘      │      └────────────┐
                    ▼                   ▼                   ▼
              ┌──────────┐     ┌──────────────┐     ┌──────────────┐
              │   TikTok │     │   EventBus   │     │   Laravel    │
              │   Live   │     │  (internal)  │     │   Service    │
              │  Server  │     └──────┬───────┘     │  (HTTP call) │
              └──────────┘            │              └──────────────┘
                                      ▼
                               ┌──────────────┐
                               │ WsEventHandler│
                               │  (translator) │
                               └──────┬───────┘
                                      ▼
                               ┌──────────────┐
                               │   WsGateway   │
                               │ (Socket.IO)   │
                               └──────┬───────┘
                                      │ WebSocket
                                      ▼
                               ┌──────────────┐
                               │   Frontend    │
                               │ (Next.js/React│
                               │  / OBS overlay│
                               └──────────────┘
```

---

## 🔑 Istilah Penting

| Istilah | Maksud |
|---------|--------|
| **JWT** | JSON Web Token — semacam KTP digital untuk otentikasi |
| **WebSocket** | Koneksi 2 arah yang selalu terbuka. Server bisa kirim data kapan aja tanpa diminta |
| **Socket.IO** | Library WebSocket yang lebih mudah dipakai (dengan fallback polling) |
| **EventEmitter** | Mekanisme "teriak-denger" di dalam kode. Satu bagian kode teriak, yang lain denger |
| **Dependency Injection** | NestJS otomatis nyediain dependensi yang dibutuhkan sebuah class |
| **Module** | Wadah yang ngumpulin controller, service, dan provider yang terkait |
| **Decorator (`@`)** | Penanda khusus di TypeScript. Contoh: `@Controller()` nandain class sebagai controller |
| **DTO** | Data Transfer Object — bungkusan data yang dikirim lewat API |
| **Proxy** | Server perantara buat koneksi internet (kadang diperlukan biar bisa akses TikTok) |

---

## 🎯 Kesimpulan

Sistem **Listener Stream** ini adalah **jembatan realtime** antara **TikTok Live** dan **aplikasi dashboard** kamu.

Dia:
1. **Nge-dengerin** siaran langsung TikTok
2. **Nangkep** setiap event (komen, gift, like, follow)
3. **Nerusin** ke Laravel (buat disimpan) dan ke WebSocket (buat realtime)
4. **Ngirim** ke frontend dalam hitungan **detik** tanpa refresh

Dibangun pake **NestJS** karena butuh struktur yang rapi, modular, dan support WebSocket bawaan — cocok banget buat aplikasi realtime kayak gini.
