# NestJS (kiri) vs Laravel (kanan) — CRUD Contact

Perbandingan **baris-per-baris** antara NestJS dan Laravel untuk fitur yang sama: **CRUD Kontak**.

Field: `id`, `name`, `phone`, `email`, `createdAt`.

---

## 🗄️ Model / Database

<table>
<tr>
<th width="50%">NestJS<br><code>prisma/schema.prisma</code></th>
<th width="50%">Laravel<br><code>database/migrations/xxxx_create_contacts_table.php</code></th>
</tr>
<tr>
<td>

```prisma
model Contact {
  id        Int      @id @default(autoincrement())
  name      String
  phone     String
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

</td>
<td>

```php
Schema::create('contacts', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('phone', 20);
    $table->string('email')->unique();
    $table->timestamps();
});
```

</td>
</tr>
<tr>
<th>NestJS<br><code>src/contacts/interfaces/contact.interface.ts</code></th>
<th>Laravel<br><code>app/Models/Contact.php</code></th>
</tr>
<tr>
<td>

```typescript
export interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}
```

</td>
<td>

```php
class Contact extends Model
{
    protected $fillable = [
        'name', 'phone', 'email'
    ];
}
```

</td>
</tr>
</table>

---

## 📦 Module / Setup

<table>
<tr>
<th width="50%">NestJS<br><code>terminal</code></th>
<th width="50%">Laravel<br><code>terminal</code></th>
</tr>
<tr>
<td>

```bash
nest generate module contacts
nest generate controller contacts
nest generate service contacts
npm install @prisma/client prisma
npx prisma init
```

</td>
<td>

```bash
php artisan make:model Contact -m
php artisan make:controller ContactController --api
php artisan make:request StoreContactRequest
```

</td>
</tr>
</table>

---

## 🛣️ Routing

<table>
<tr>
<th width="50%">NestJS<br><code>src/contacts/contacts.controller.ts</code></th>
<th width="50%">Laravel<br><code>routes/api.php</code></th>
</tr>
<tr>
<td>

```typescript
@Controller('contacts')
export class ContactsController {
  @Get()
  findAll() {}

  @Post()
  create() {}

  @Get(':id')
  findOne(@Param('id') id: string) {}

  @Put(':id')
  update(@Param('id') id: string) {}

  @Delete(':id')
  remove(@Param('id') id: string) {}
}
```

</td>
<td>

```php
Route::apiResource('contacts', ContactController::class);
// 1 baris = 5 route otomatis:
// GET    /contacts       → index()
// POST   /contacts       → store()
// GET    /contacts/{id}  → show()
// PUT    /contacts/{id}  → update()
// DELETE /contacts/{id}  → destroy()
```

</td>
</tr>
</table>

---

## ✅ Validation

<table>
<tr>
<th width="50%">NestJS<br><code>src/contacts/dto/create-contact.dto.ts</code></th>
<th width="50%">Laravel<br><code>app/Http/Requests/StoreContactRequest.php</code></th>
</tr>
<tr>
<td>

```typescript
import { IsString, IsEmail,
        MaxLength, IsNotEmpty } from 'class-validator';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}
```

Untuk update:
```typescript
export class UpdateContactDto
  extends PartialType(CreateContactDto) {}
// PartialType = semua field optional
```

</td>
<td>

```php
class StoreContactRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name'  => 'required|string|max:100',
            'phone' => 'required|string|max:20',
            'email' => 'required|email|unique:contacts,email',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Nama wajib diisi',
        ];
    }
}
```

Laravel — ga ada PartialType bawaan, harus manual tiap field di method `rules()` untuk update request.

</td>
</tr>
</table>

---

## 🎮 Controller — Full CRUD

<table>
<tr>
<th width="50%">NestJS<br><code>src/contacts/contacts.controller.ts</code></th>
<th width="50%">Laravel<br><code>app/Http/Controllers/ContactController.php</code></th>
</tr>
<tr>
<td>

```typescript
@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly service: ContactsService
  ) {}

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Post()
  async create(
    @Body() dto: CreateContactDto
  ) {
    return this.service.create(dto);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string
  ) {
    return this.service.findOne(+id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto
  ) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string
  ) {
    return this.service.remove(+id);
  }
}
```

</td>
<td>

```php
class ContactController extends Controller
{
    public function index()
    {
        return Contact::latest()->paginate(10);
    }

    public function store(
        StoreContactRequest $request
    ) {
        $contact = Contact::create(
            $request->validated()
        );
        return response()->json(
            $contact, 201
        );
    }

    public function show(string $id)
    {
        return Contact::findOrFail($id);
    }

    public function update(
        StoreContactRequest $request,
        string $id
    ) {
        $contact = Contact::findOrFail($id);
        $contact->update(
            $request->validated()
        );
        return response()->json($contact);
    }

    public function destroy(string $id)
    {
        $contact = Contact::findOrFail($id);
        $contact->delete();
        return response()->json(null, 204);
    }
}
```

</td>
</tr>
</table>

---

## 🧠 Service Layer

<table>
<tr>
<th width="50%">NestJS<br><code>src/contacts/contacts.service.ts</code> (WAJIB)</th>
<th width="50%">Laravel<br><code>app/Services/ContactService.php</code> (OPSIONAL)</th>
</tr>
<tr>
<td>

```typescript
@Injectable()
export class ContactsService {
  constructor(
    private prisma: PrismaService
  ) {}

  async findAll() {
    return this.prisma.contact.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const contact =
      await this.prisma.contact
        .findUnique({ where: { id } });
    if (!contact)
      throw new NotFoundException(
        `Contact #${id} not found`
      );
    return contact;
  }

  async create(dto: CreateContactDto) {
    return this.prisma.contact
      .create({ data: dto });
  }

  async update(
    id: number,
    dto: UpdateContactDto
  ) {
    await this.findOne(id); // cek dulu
    return this.prisma.contact.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.contact
      .delete({ where: { id } });
  }
}
```

</td>
<td>

```php
// Laravel — kebanyakan programmer
// langsung panggil Model di controller.
// Service sifatnya OPSIONAL:

class ContactService
{
    public function getAll()
    {
        return Contact::latest()
                      ->paginate(10);
    }

    public function create(
        array $data
    ): Contact {
        return Contact::create($data);
    }

    public function findById(int $id)
    {
        return Contact::findOrFail($id);
    }

    public function update(
        int $id,
        array $data
    ): Contact {
        $contact = $this->findById($id);
        $contact->update($data);
        return $contact;
    }

    public function delete(int $id)
    {
        $contact = $this->findById($id);
        $contact->delete();
    }
}
```

</td>
</tr>
</table>

---

## 📦 Module Registration

<table>
<tr>
<th width="50%">NestJS<br><code>src/contacts/contacts.module.ts</code> (WAJIB)</th>
<th width="50%">Laravel — (TIDAK ADA, auto-discovery)</th>
</tr>
<tr>
<td>

```typescript
@Module({
  imports: [PrismaModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
```

Root module<br><code>src/app.module.ts</code>:

```typescript
@Module({
  imports: [ContactsModule],
})
export class AppModule {}
```

</td>
<td>

```php
// Laravel: cukup daftar di routes/api.php
// Service Provider cuma kalau ada
// binding khusus.

// Di Laravel semuanya auto-wired.
// Controller ketemu Model langsung.
```

</td>
</tr>
</table>

---

## 🚀 Entry Point

<table>
<tr>
<th width="50%">NestJS<br><code>src/main.ts</code></th>
<th width="50%">Laravel — (gak disentuh)</th>
</tr>
<tr>
<td>

```typescript
async function bootstrap() {
  const app = await NestFactory
    .create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  await app.listen(
    process.env.PORT ?? 3000
  );
}
bootstrap();
```

</td>
<td>

```php
// Laravel: public/index.php
// — gak pernah disentuh programmer
// Semua konfigurasi lewat:
// - .env
// - config/*.php
// - AppServiceProvider
```

</td>
</tr>
</table>

---

## 📊 Ringkasan 1 Lawan 1

<table>
<tr>
<th>Layer</th>
<th>NestJS</th>
<th>Laravel</th>
</tr>
<tr>
<td>CLI</td>
<td><code>nest g controller users</code></td>
<td><code>php artisan make:controller UsersController</code></td>
</tr>
<tr>
<td>Routing</td>
<td><code>@Get()</code> decorator di method</td>
<td><code>Route::get()</code> di file terpisah</td>
</tr>
<tr>
<td>Validasi</td>
<td>Class DTO + decorator tiap field</td>
<td><code>$request->validate([...])</code> array</td>
</tr>
<tr>
<td>Controller → Model</td>
<td>Controller → <strong>Service</strong> → ORM</td>
<td>Controller langsung → Model (Eloquent)</td>
</tr>
<tr>
<td>Service</td>
<td><strong>WAJIB</strong> — arsitektur baku</td>
<td><strong>OPSIONAL</strong> — kebanyakan lewati</td>
</tr>
<tr>
<td>Module</td>
<td><strong>WAJIB</strong> — tiap fitur punya module</td>
<td>Tidak ada (auto-discovery)</td>
</tr>
<tr>
<td>ORM</td>
<td>Pilih sendiri: Prisma / TypeORM / Drizzle</td>
<td>Eloquent (bawaan framework)</td>
</tr>
<tr>
<td>Error 404</td>
<td><code>throw new NotFoundException()</code></td>
<td><code>Model::findOrFail()</code></td>
</tr>
<tr>
<td>Response</td>
<td><code>return data</code> (auto JSON)</td>
<td><code>response()->json($data)</code></td>
</tr>
<tr>
<td>Inject request body</td>
<td><code>@Body() dto: CreateDto</code></td>
<td><code>StoreContactRequest $request</code></td>
</tr>
<tr>
<td>Inject route param</td>
<td><code>@Param('id') id: string</code></td>
<td><code>string $id</code></td>
</tr>
</table>

> **Pola pikir**: "Di Laravel saya nulis `Model::create($data)`. Di NestJS saya nulis `this.prisma.model.create({ data })`. Konsepnya SAMA, cuma syntax-nya beda."

</td>
</tr>
</table>

---

## 🎯 Cara Baca Dokumen Ini

Buka di browser via `npm run docs` → http://localhost:4000/crud-contact-comparison

Setiap section punya **dua kolom**:
- **KIRI** → NestJS (TypeScript)
- **KANAN** → Laravel (PHP)

Cocokkan baris-per-baris untuk melihat padanan syntax-nya.
