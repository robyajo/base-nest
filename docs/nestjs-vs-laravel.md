# NestJS vs Laravel — Padanan Istilah untuk yang Udah Paham Laravel

Karena kamu udah kenal Laravel, ini dia padanan istilahnya biar cepet nyambung.

---

## 🔁 Perbandingan Konsep Dasar

| Laravel (PHP) | NestJS (TypeScript) | Penjelasan |
|:---|:---|:---|
| **Artisan CLI** (`php artisan`) | **Nest CLI** (`nest`) | Sama-sama CLI untuk generate file, build project, dll |
| **`routes/web.php` / `routes/api.php`** | **Controller + Decorator `@Get()`, `@Post()`** | Routing didefinisikan pake decorator langsung di controller |
| **`php artisan make:controller`** | **`nest generate controller`** | Generate file controller otomatis |
| **`php artisan serve`** | **`npm run start:dev`** | Jalanin server development |
| **`artisan make:model`** | Interface/Class biasa (gak ada artisan) | Model di NestJS cuma interface/class biasa, urusan data di Service |
| **`artisan make:middleware`** | **Guard** (mirip middleware route) | Middleware untuk proteksi route |
| **Blade Template** | ❌ Gak ada (NestJS pure backend, frontend pisah) | NestJS cuma API, rendering diserahkan ke React/Vue/Next.js |
| **Eloquent ORM** | **Prisma / TypeORM / Drizzle** (pilih sendiri) | ORM bebas pilih, di project ini gak pake ORM (pake in-memory) |
| **`.env`** | **`@nestjs/config`** | Sama-sama baca file `.env` di root project |
| **Composer** | **npm / yarn / pnpm** | Package manager |
| **`php artisan tinker`** | ❌ Gak ada | REPL interaktif |
| **`artisan make:listener`** | **`@OnEvent()` decorator** | Event listener |

---

## 🏗️ Perbandingan Struktur Folder

```
📁 Laravel                          📁 NestJS
│                                   │
├── app/                            ├── src/
│   ├── Http/                       │   ├── modules/
│   │   ├── Controllers/            │   │   ├── tiktok/
│   │   │   └── TikTokController    │   │   │   ├── tiktok.controller.ts
│   │   └── Middleware/             │   │   │   └── ...
│   ├── Models/                     │   │   ├── websocket/
│   │   └── TikTokAccount.php       │   │   │   └── websocket.module.ts
│   ├── Events/                     │   ├── events/
│   │   └── TikTokEventIngested.php │   │   ├── event-names.ts
│   ├── Listeners/                  │   │   ├── event-payloads.ts
│   │   └── WsEventHandler.php      │   │   └── ws-event.handler.ts
│   └── Services/                   │   ├── services/
│       └── TikTokService.php       │   │   └── laravel.service.ts
│                                   │   ├── gateways/
│                                   │   │   └── ws.gateway.ts
├── config/                         ├── config/
│   └── app.php                     │   └── config.module.ts
├── routes/                         │   (ada di decorator controller)
│   └── api.php                     │
├── database/                       ├── shared/  (type definitions)
│   └── migrations/                 │   └── events.ts
└── .env                            └── .env
```

---

## 🧩 Padanan 1-on-1

### 1. Module ↔ Service Provider + Route grouping

```php
// Laravel — Service Provider
public function register() {
    $this->app->singleton(TikTokService::class);
}
// Route
Route::prefix('api/internal/tiktok')->group(...
```

```typescript
// NestJS — Module
@Module({
  controllers: [TikTokController],
  providers: [TikTokService],
  exports: [TikTokService],
})
export class TikTokModule {}
```

> **Bedanya**: Di NestJS, module adalah **wajib** — setiap fitur PUNYA module sendiri.  
> Di Laravel, service provider opsional, bisa jalan tanpa provider.

---

### 2. Controller ↔ Controller (mirip banget)

```php
// Laravel
class TikTokController extends Controller {
    public function connect(Request $request) {
        return $this->tiktokService->connect(...);
    }
}
```

```typescript
// NestJS
@Controller('api/internal/tiktok')
export class TikTokController {
    @Post('connect')
    async connect(@Body() dto: ConnectDto) {
        return this.tiktokService.connect(...);
    }
}
```

> **Bedanya**: NestJS pake **decorator** buat nentuin method (`@Post`, `@Get`) dan parameter (`@Body`, `@Param`). Laravel pake method `Request $request` atau route binding.

---

### 3. Service (dan Dependency Injection)

```php
// Laravel — di controller
public function __construct(
    protected TikTokService $tiktokService
) {}
```

```typescript
// NestJS — sama persis
constructor(
    private tiktokService: TikTokService
) {}
```

> Kedua framework punya dependency injection otomatis.  
> **Bedanya halus**: Laravel inject dari container, NestJS inject dari module scope.

---

### 4. Routing — Perbedaan Paling Mencolok

```php
// Laravel — semua route di 1 file routes/api.php
Route::post('/connect', [TikTokController::class, 'connect']);
Route::post('/disconnect', [TikTokController::class, 'disconnect']);
```

```typescript
// NestJS — routing di controller dengan decorator
@Controller('api/internal/tiktok')
export class TikTokController {
  @Post('connect')     // → POST /api/internal/tiktok/connect
  async connect() {}

  @Post('disconnect')  // → POST /api/internal/tiktok/disconnect
  async disconnect() {}
}
```

> **Keunggulan NestJS**: Route dekat dengan method-nya, gak perlu bolak-balik file `routes/api.php`.  
> **Keunggulan Laravel**: Sekilas lihat `routes/api.php`, langsung tahu semua endpoint yang tersedia.

---

### 5. Middleware ↔ Guard

```php
// Laravel — middleware
Route::middleware('auth:sanctum')->group(...
```

```typescript
// NestJS — Guard
@UseGuards(JwtAuthGuard)
@Post('connect')
async connect() {}
```

> **Mirip**: Sama-sama jalan SEBELUM controller diproses.  
> **Bedanya**: NestJS juga punya `Interceptor` (jalan sebelum/sesudah) dan `Pipe` (validasi data masuk) yang lebih fleksibel.

---

### 6. Event & Listener

```php
// Laravel — Event class + Listener class
event(new TikTokEventIngested($payload));
```

```typescript
// NestJS — pake @nestjs/event-emitter
this.eventEmitter.emit('tiktok.event.ingested', payload);

// Listener
@OnEvent('tiktok.event.ingested')
handleEvent(payload: TikTokEventIngestedPayload) {}
```

> **Sama banget** konsepnya. Cuma NestJS gak perlu bikin file Event class terpisah — bisa langsung emit string + payload.

---

### 7. Validation

```php
// Laravel — Form Request
public function rules() {
    return [
        'accountId' => 'required|string',
        'userId' => 'required|string',
    ];
}
```

```typescript
// NestJS — class-validator (atau Zod di project ini)
// pake Pipe atau manual validation di service
```

> Di project ini validasi masih manual, tapi best practice NestJS pake **DTO + class-validator**.

---

### 8. WebSocket — Yang Gak Ada Padanannya di Laravel (standar)

| Laravel | NestJS |
|:--------|:-------|
| `laravel-websockets` (package pihak ke-3) | **Built-in** `@nestjs/websockets` + `@nestjs/platform-socket.io` |
| Pusher config ribet | Tinggal pake decorator `@WebSocketGateway()` |
| Event broadcasting → channel | Gateway + `@SubscribeMessage()` |

> **Ini kelebihan besar NestJS**. WebSocket support-nya FIRST-CLASS citizen, bukan add-on.

---

### 9. ORM / Database

```php
// Laravel — Eloquent
$session = LiveSession::create([...]);
```

```typescript
// NestJS — Prisma (contoh)
const session = await prisma.liveSession.create({ data: {...} });
```

> Di **project ini** gak pake ORM. Data disimpan **in-memory** di Maps JavaScript (`Map<string, TikTokConnection>`).  
> Urusan penyimpanan permanen ditangani Laravel lewat HTTP API.

---

### 10. Configuration

```php
// Laravel
config('app.name');
```

```typescript
// NestJS
this.configService.get<string>('LARAVEL_URL');
```

> Sama-sama baca dari `.env`. Bedanya NestJS pake `@nestjs/config` module yang di-import manual, Laravel otomatis.

---

## ⚡ Ringkasan Cepat

| Yang Kamu Tahu di Laravel | Padanan di NestJS | Catatan |
|:---|---:|:---|
| `php artisan` | `nest` | CLI |
| `Controller` | `@Controller()` | Sama |
| `Model` | Interface / Prisma schema | Model gak wajib |
| `Blade` | ❌ — frontend pisah | NestJS pure API |
| `Request $request` | `@Body()`, `@Param()`, `@Query()` | Decorator |
| `Middleware` | `Guard`, `Interceptor`, `Pipe` | Lebih variatif |
| `Event::dispatch()` | `eventEmitter.emit()` | Sama |
| `Listener::handle()` | `@OnEvent()` decorator | Sama |
| `config/app.php` | `ConfigModule` + `.env` | Sama |
| `routes/api.php` | Decorator di Controller | Berbeda pendekatan |
| `artisan make:controller` | `nest g controller` | Sama-sama generate |
| WebSocket (Pusher) | `@WebSocketGateway()` | **NestJS built-in** |
| Eloquent ORM | Prisma / TypeORM | Bebas pilih |
| `php artisan serve` | `npm run start:dev` | Sama |

---

## 🎯 Pesan Utama

Kalau kamu udah paham Laravel, **NestJS bakal terasa familiar** karena konsepnya sama:

1. MVC pattern → Module → Controller → Service
2. Dependency injection — otomatis kayak Laravel
3. Event/Listener — sama persis
4. Middleware/Guard — mirip
5. `.env` config — sama

**Yang bikin NestJS beda:**
- TypeScript (type safety, error ketahuan sebelum jalan)
- Decorator-based routing (route nempel di controller method)
- WebSocket FIRST CLASS (gak perlu tambahan package kayak Pusher)
- Modularitas lebih strict (setiap fitur WAJIB punya module)
- Frontend pisah total (gak ada Blade)

**Dengan kata lain**: NestJS adalah Laravel-nya TypeScript — tapi lebih strict, modern, dan realtime-ready.
