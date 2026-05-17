# Prisma (NestJS) vs Eloquent (Laravel) — ORM Comparison

Perbandingan **baris-per-baris** dua ORM paling populer untuk masing-masing framework.

---

## 📌 Apa Itu ORM?

**ORM** (Object-Relational Mapping) = **penerjemah** antara database (SQL) dan kode aplikasi (PHP/TypeScript).

Alih-alih nulis SQL manual:

```sql
SELECT * FROM contacts WHERE email = 'john@example.com';
```

Kamu cukup nulis:

```php
// Eloquent
Contact::where('email', 'john@example.com')->get();
```

```typescript
// Prisma
prisma.contact.findMany({ where: { email: 'john@example.com' } });
```

---

## 1. 🗄️ Definisi Model / Schema

<table>
<tr>
<th width="50%">Prisma<br><code>prisma/schema.prisma</code></th>
<th width="50%">Eloquent<br><code>database/migrations/xxxx_create_contacts_table.php</code> + <code>app/Models/Contact.php</code></th>
</tr>
<tr>
<td>

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Contact {
  id        Int      @id @default(autoincrement())
  name      String
  phone     String
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relasi
  orders    Order[]
}

model Order {
  id          Int      @id @default(autoincrement())
  contactId   Int
  total       Float
  contact     Contact  @relation(fields: [contactId], references: [id])
  createdAt   DateTime @default(now())
}
```

</td>
<td>

```php
// 1. Migration
Schema::create('contacts', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('phone', 20);
    $table->string('email')->unique();
    $table->timestamps();
});

Schema::create('orders', function (Blueprint $table) {
    $table->id();
    $table->foreignId('contact_id')
          ->constrained()
          ->onDelete('cascade');
    $table->float('total');
    $table->timestamps();
});
```

```php
// 2. Model terpisah
class Contact extends Model
{
    protected $fillable = [
        'name', 'phone', 'email'
    ];

    public function orders()
    {
        return $this->hasMany(Order::class);
    }
}

class Order extends Model
{
    public function contact()
    {
        return $this->belongsTo(Contact::class);
    }
}
```

</td>
</tr>
</table>

> **Prisma**: Schema & relasi dalam **1 file** (`schema.prisma`). Dari situ otomatis generate TypeScript types.
> **Eloquent**: **2 file terpisah** — migration (struktur DB) + model (behavior/logic).

---

## 2. 🔧 Setup & Init

<table>
<tr>
<th width="50%">Prisma</th>
<th width="50%">Eloquent</th>
</tr>
<tr>
<td>

```bash
# Install
npm install @prisma/client prisma

# Init
npx prisma init
# → bikin prisma/schema.prisma + .env

# Tulis schema → apply ke DB
npx prisma migrate dev --name init

# Generate client (setiap kali schema berubah)
npx prisma generate

# Lihat data di browser
npx prisma studio
```

</td>
<td>

```bash
# Init (built-in, gak perlu install)
laravel new contact-app

# Bikin migration + model
php artisan make:model Contact -m

# Edit migration file → apply
php artisan migrate

# Lihat data (via toolkit)
# atau install: composer require laravel/telescope
```

</td>
</tr>
</table>

> **Prisma**: Harus jalanin `prisma generate` setiap kali schema berubah. Tapi dapet **type safety** otomatis.
> **Eloquent**: `php artisan migrate` — langsung jadi. Tapi **tanpa type safety** (return `array`/`stdClass`).

---

## 3. 🔍 Query — SELECT

<table>
<tr>
<th width="50%">Prisma</th>
<th width="50%">Eloquent</th>
</tr>
<tr>
<td>

```typescript
// Semua kontak
const all = await prisma.contact.findMany();

// Filter
const johns = await prisma.contact.findMany({
  where: {
    name: { contains: 'John' },
    email: { endsWith: '@gmail.com' },
  },
});

// Satu item by ID
const contact = await prisma.contact.findUnique({
  where: { id: 1 },
});

// Null kalau gak ketemu
// (gak throw error)

// Kalau mau throw error:
if (!contact) {
  throw new NotFoundException();
}

// Pilih field tertentu
const partial = await prisma.contact.findMany({
  select: { id: true, name: true },
});

// Pagination
const paged = await prisma.contact.findMany({
  skip: 0,
  take: 10,
  orderBy: { createdAt: 'desc' },
});
```

</td>
<td>

```php
// Semua kontak
$all = Contact::all();

// Filter
$johns = Contact::where('name', 'like', '%John%')
    ->where('email', 'like', '%@gmail.com')
    ->get();

// Satu item by ID
$contact = Contact::find(1);

// Null kalau gak ketemu

// Kalau mau throw error:
$contact = Contact::findOrFail(1);

// Pilih field tertentu
$partial = Contact::select('id', 'name')->get();

// Pagination (otomatis dapet meta)
$paged = Contact::latest()
    ->paginate(10);
```

</td>
</tr>
</table>

---

## 4. ➕ CREATE

<table>
<tr>
<th width="50%">Prisma</th>
<th width="50%">Eloquent</th>
</tr>
<tr>
<td>

```typescript
const contact = await prisma.contact.create({
  data: {
    name: 'John Doe',
    phone: '08123456789',
    email: 'john@example.com',
  },
});
// return object Contact
```

</td>
<td>

```php
$contact = Contact::create([
    'name'  => 'John Doe',
    'phone' => '08123456789',
    'email' => 'john@example.com',
]);
// return object Contact
```

</td>
</tr>
</table>

> **Sama persis** — beda syntax dikit.

---

## 5. ✏️ UPDATE

<table>
<tr>
<th width="50%">Prisma</th>
<th width="50%">Eloquent</th>
</tr>
<tr>
<td>

```typescript
const contact = await prisma.contact.update({
  where: { id: 1 },
  data: {
    name: 'John Updated',
  },
});

// Error kalau id 1 gak ada
// → PrismaClientKnownRequestError
```

</td>
<td>

```php
$contact = Contact::findOrFail(1);
$contact->update([
    'name' => 'John Updated',
]);

// atau 1 baris:
Contact::where('id', 1)->update([
    'name' => 'John Updated',
]);
```

</td>
</tr>
</table>

> **Prisma**: `update()` otomatis throw error kalau record gak ada.
> **Eloquent**: `update()` di query builder gak throw error. Harus panggil `findOrFail()` dulu.

---

## 6. 🗑️ DELETE

<table>
<tr>
<th width="50%">Prisma</th>
<th width="50%">Eloquent</th>
</tr>
<tr>
<td>

```typescript
const contact = await prisma.contact.delete({
  where: { id: 1 },
});

// Error kalau id 1 gak ada
```

</td>
<td>

```php
$contact = Contact::findOrFail(1);
$contact->delete();

// atau 1 baris:
Contact::destroy(1);

// destroy() gak throw error
// kalau id gak ada.
```

</td>
</tr>
</table>

---

## 7. 🔗 Relasi — JOIN / Include

<table>
<tr>
<th width="50%">Prisma</th>
<th width="50%">Eloquent</th>
</tr>
<tr>
<td>

```typescript
// Include relasi
const contact = await prisma.contact.findUnique({
  where: { id: 1 },
  include: { orders: true },
});
// return:
// { id: 1, name: '...', orders: [...] }

// Nested filter
const contact = await prisma.contact.findMany({
  where: {
    orders: {
      some: { total: { gte: 100000 } },
    },
  },
  include: { orders: true },
});

// Nested create
const contact = await prisma.contact.create({
  data: {
    name: 'John',
    phone: '08123456789',
    email: 'john@example.com',
    orders: {
      create: { total: 50000 },
    },
  },
  include: { orders: true },
});
```

</td>
<td>

```php
// Include relasi (lazy loading)
$contact = Contact::find(1);
$orders = $contact->orders;
// → query terpisah (n+1 problem)

// Eager loading
$contact = Contact::with('orders')
    ->find(1);

// Nested filter (whereHas)
$contacts = Contact::whereHas('orders',
    function ($q) {
        $q->where('total', '>=', 100000);
    }
)->with('orders')->get();

// Nested create
$contact = Contact::create([...]);
$contact->orders()->create([
    'total' => 50000
]);
```

</td>
</tr>
</table>

> **Prisma**: Semua pake `include` — query otomatis optimize (1-2 query total).
> **Eloquent**: Ada **n+1 problem** kalau lupa pake `with()`. Tapi lebih fleksibel buat query kompleks.

---

## 8. 📊 Transactions

<table>
<tr>
<th width="50%">Prisma</th>
<th width="50%">Eloquent</th>
</tr>
<tr>
<td>

```typescript
const result = await prisma.$transaction([
  prisma.contact.update({
    where: { id: 1 },
    data: { name: 'New Name' },
  }),
  prisma.order.create({
    data: {
      contactId: 1,
      total: 25000,
    },
  }),
]);
// Kalau ada error, semua ROLLBACK otomatis

// Atau pake callback (lebih fleksibel)
await prisma.$transaction(async (tx) => {
  await tx.contact.update({...});
  await tx.order.create({...});
});
```

</td>
<td>

```php
DB::transaction(function () {
    Contact::findOrFail(1)->update([
        'name' => 'New Name'
    ]);
    Order::create([
        'contact_id' => 1,
        'total' => 25000,
    ]);
});
// Kalau ada error, semua ROLLBACK
```

</td>
</tr>
</table>

> **Konsepnya SAMA PERSIS**. Beda syntax dikit.

---

## 9. 🔐 Type Safety — Keunggulan Utama Prisma

### Prisma — Auto-generated TypeScript types
```typescript
// Setiap kali jalanin prisma generate,
// Prisma bikin file node_modules/.prisma/client/
// yang isinya type untuk setiap model.

// Kamu bisa pake langsung:
import { Contact, Prisma } from '@prisma/client';

// Type untuk input create:
const data: Prisma.ContactCreateInput = {
  name: 'John',
  phone: '08123456789',
  email: 'john@example.com',
};

// Type untuk return:
const contact: Contact = await prisma.contact.findUnique({
  where: { id: 1 },
});

// Kalau ada typo, error di COMPILE TIME
// Bukan waktu jalan!
```

### Eloquent — Tidak ada type safety
```php
// Semua return dari Eloquent adalah
// stdClass / array — TANPA type safety

$contact = Contact::find(1);
$contact->nAmE; // ← typo, error baru ketahuan
               //   WAKTU JALAN (runtime)
// PHP gak bisa deteksi ini sebelum dieksekusi
```

> **Ini keunggulan utama Prisma + TypeScript**: error ketahuan waktu nulis kode, bukan waktu produksi.

---

## 10. 🧩 Perbedaan Konseptual

<table>
<tr>
<th>Aspek</th>
<th>Prisma</th>
<th>Eloquent</th>
</tr>
<tr>
<td><strong>File model</strong></td>
<td>1 file <code>schema.prisma</code> untuk SEMUA model</td>
<td>1 file per model (bisa banyak file)</td>
</tr>
<tr>
<td><strong>Type safety</strong></td>
<td>✅ Auto-generate TypeScript types</td>
<td>❌ Tidak ada (PHP dynamic typing)</td>
</tr>
<tr>
<td><strong>Migration</strong></td>
<td><code>npx prisma migrate dev</code></td>
<td><code>php artisan migrate</code></td>
</tr>
<tr>
<td><strong>Rollback migrasi</strong></td>
<td>Gak support rollback (harus buat migrasi baru)</td>
<td>✅ <code>php artisan migrate:rollback</code></td>
</tr>
<tr>
<td><strong>Seeder / Factory</strong></td>
<td>Manual (bisa pake <code>prisma/seed.ts</code>)</td>
<td>✅ Built-in <code>php artisan make:seeder</code> + <code>Factory</code></td>
</tr>
<tr>
<td><strong>Query builder</strong></td>
<td>Fluent API (<code>findMany({ where: {...} })</code>)</td>
<td>Fluent API (<code>where()->where()->get()</code>)</td>
</tr>
<tr>
<td><strong>N+1 problem</strong></td>
<td>✅ Otomatis handle via <code>include</code></td>
<td>❌ Harus manual pake <code>with()</code></td>
</tr>
<tr>
<td><strong>Pagination</strong></td>
<td>Manual: <code>skip + take</code></td>
<td>✅ Built-in: <code>paginate(10)</code> + meta otomatis</td>
</tr>
<tr>
<td><strong>Raw SQL</strong></td>
<td><code>prisma.$queryRaw\`SELECT ...\`</code></td>
<td><code>DB::select('SELECT ...')</code></td>
</tr>
<tr>
<td><strong>GUI (lihat data)</strong></td>
<td><code>npx prisma studio</code> (browser otomatis)</td>
<td>Gak ada bawaan (pake TablePlus/HeidiSQL)</td>
</tr>
<tr>
<td><strong>Relasi</strong></td>
<td>Didefinisikan di schema (satu tempat)</td>
<td>Didefinisikan di method model masing-masing</td>
</tr>
</table>

---

## 11. 🎯 Contoh Realistis — Contact punya Order

### Prisma — 1 query dapet semuanya
```typescript
const result = await prisma.contact.findMany({
  where: {
    orders: {
      some: { total: { gte: 50000 } },
    },
  },
  include: {
    orders: {
      orderBy: { createdAt: 'desc' },
      take: 5,
    },
  },
  orderBy: { name: 'asc' },
});
// 1 query SQL (JOIN)
```

### Eloquent — Perlu eager loading
```php
$result = Contact::whereHas('orders',
    function ($q) {
        $q->where('total', '>=', 50000);
    }
)->with(['orders' => function ($q) {
    $q->latest()->limit(5);
}])->orderBy('name')->get();
// 2 query SQL + mungkin n+1
```

---

## 12. 💡 Kapan Pake Yang Mana?

### ✅ Pilih Prisma kalau:
- Kamu pake TypeScript (type safety adalah game changer)
- Kamu suka schema terpusat di 1 file
- Project baru, gak ada legacy database
- Mau integrasi mulus sama NestJS

### ✅ Pilih Eloquent kalau:
- Kamu pake Laravel (Eloquent built-in, gak perlu install)
- Butuh migration rollback
- Butuh Factory & Seeder bawaan
- Query kompleks / raw SQL lebih gampang
- Tim lebih familiar PHP

---

## 📊 Ringkasan 1 Baris

| Operasi | Prisma | Eloquent |
|:---------|:-------|:---------|
| Get all | `prisma.contact.findMany()` | `Contact::all()` |
| Get by ID | `prisma.contact.findUnique({ where: { id } })` | `Contact::find($id)` |
| Filter | `where: { name: { contains: 'x' } }` | `where('name', 'like', '%x%')` |
| Create | `prisma.contact.create({ data: {...} })` | `Contact::create([...])` |
| Update | `prisma.contact.update({ where: { id }, data: {...} })` | `Contact::findOrFail($id)->update([...])` |
| Delete | `prisma.contact.delete({ where: { id } })` | `Contact::destroy($id)` |
| Include relasi | `include: { orders: true }` | `with('orders')` |
| Pagination | `skip: 0, take: 10` | `paginate(10)` |
| Transaction | `prisma.$transaction([...])` | `DB::transaction(function() {...})` |
| Raw SQL | `prisma.$queryRaw\`SELECT ...\`` | `DB::select('SELECT ...')` |
| Type safety | ✅ Auto-generate types | ❌ Dynamic return type |
