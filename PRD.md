# PRD — Log Pengerjaan WEDM

## 1. Latar belakang
Pencatatan hasil pengerjaan mesin Wire EDM (Sodick) masih manual di kertas (kolom: NO, PR, ITEM, WAKTU mulai/selesai, CUSTOMER, MESIN, KETERANGAN/tanggal). Susah dicari, tulisan susah dibaca, dan tidak bisa direkap.

## 2. Tujuan
- Ganti kertas dengan web sederhana, bisa dibuka dari HP/PC di workshop.
- Data gampang dicari (PR, customer, mesin, tanggal).
- Durasi pengerjaan terhitung otomatis.
- **Biaya Rp 0** (Supabase free + hosting statis gratis).

## 3. User
| Role | Kebutuhan |
|---|---|
| Operator (Agung, dll) | Input cepat, edit, hapus |
| Atasan/admin (opsional) | Lihat & export rekap |

Versi 1: semua user yang login punya akses penuh (kerja bareng, 1 tim).

## 4. Fitur
### MVP (v1)
1. Login email + password (Supabase Auth).
2. Form input pengerjaan: tanggal, PR, ukuran item, qty, jam mulai, jam selesai, customer, mesin, catatan.
3. Tombol **"Mulai sekarang"** / **"Selesai sekarang"** (isi jam otomatis).
4. Tabel data + pencarian PR/item/catatan + filter tanggal, customer, mesin.
5. Edit & hapus data.
6. Durasi otomatis (menit → jam:menit), termasuk lewat tengah malam.
7. Tambah customer / mesin baru langsung dari form.
8. Export CSV (buat Excel).
9. Penanda status: "Jalan" kalau jam selesai kosong.

### Nanti (v2)
- Dashboard rekap (total job/hari, jam mesin per mesin, per customer).
- Upload foto hasil/gambar kerja (Supabase Storage).
- Role admin vs operator.
- Print laporan PDF.

## 5. Non-functional
- Responsive (HP dulu, karena dipakai di workshop).
- Gratis: Supabase Free (500 MB DB) cukup untuk puluhan ribu baris.
- Catatan free tier: project Supabase bisa **auto-pause setelah ~1 minggu tidak aktif**; tinggal klik restore di dashboard.
- Keamanan: RLS aktif, hanya user login yang bisa baca/tulis. Anon key aman dipublikasikan **asal RLS aktif**. Matikan "Allow new users to sign up" setelah akun tim dibuat.

## 6. Struktur Database
### `machines`
| Kolom | Tipe | Catatan |
|---|---|---|
| id | bigint PK | identity |
| name | text unique | Sodick 1, Sodick 2 |
| is_active | boolean | default true |
| created_at | timestamptz | |

### `customers`
| Kolom | Tipe | Catatan |
|---|---|---|
| id | bigint PK | identity |
| name | text unique | Gesso 1, Gesso 2 |
| created_at | timestamptz | |

### `jobs` (1 baris = 1 baris kertas)
| Kolom | Tipe | Mapping kertas |
|---|---|---|
| id | uuid PK | (NO diganti otomatis) |
| job_date | date | KETERANGAN (tanggal) |
| pr_no | text | PR (MW2 125) |
| item_size | text | ITEM (16.37 x 117.06) |
| qty | int (>0) | "2pcs" di ITEM |
| start_time | time | WAKTU mulai |
| end_time | time, nullable | WAKTU selesai |
| customer_id | FK → customers | CUSTOMER |
| machine_id | FK → machines | MESIN |
| notes | text | catatan tambahan |
| created_by | uuid FK → auth.users | siapa yang input |
| created_at / updated_at | timestamptz | audit |

### View `jobs_view`
Join jobs + customers + machines, plus `duration_min` (selisih end−start, handle lewat tengah malam).

### Relasi
```
customers 1 ──< jobs >── 1 machines
auth.users 1 ──< jobs (created_by)
```

## 7. Alur utama
1. Operator login → halaman utama (form + tabel).
2. Mulai kerja: isi PR/item/customer/mesin, klik "Mulai sekarang", simpan.
3. Selesai: edit baris itu, klik "Selesai sekarang", simpan → durasi terhitung.
4. Cari data lama lewat kolom search / filter.

## 8. Tech stack
- Frontend: 1 file HTML + Supabase JS (CDN), tanpa build.
- Backend/DB/Auth: Supabase Free.
- Hosting: Cloudflare Pages / Netlify / Vercel / GitHub Pages (semua gratis).

## 9. Setup
1. Buat project di supabase.com → SQL Editor → jalankan `schema.sql`.
2. Authentication → Users → Add user (email + password untuk tim).
3. Settings → API → copy **Project URL** dan **anon public key** → tempel di bagian CONFIG `index.html`.
4. Upload `index.html` ke hosting gratis (atau buka lokal dulu buat tes).
5. Matikan sign-up publik: Authentication → Providers → Email → matikan "Allow new users to sign up".

## 10. Kriteria sukses
- Input 1 pengerjaan < 30 detik.
- Cari PR apa pun < 5 detik.
- Kertas tidak dipakai lagi setelah 2 minggu.
