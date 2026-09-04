# Happy Puppy Citos - Free Room 1 Jam Voucher System

Project ini adalah website static untuk GitHub Pages + Supabase.

Customer bisa claim voucher gratis tanpa login. Database Supabase menjadi sumber kebenaran, jadi nomor WhatsApp yang sama hanya bisa claim 1 kali per hari kalender WITA.

## File yang perlu kamu ubah

### 1. `js/config.js`

Buka file ini lalu isi bagian berikut:

```js
supabaseUrl: "YOUR_SUPABASE_URL",
supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
whatsappNumber: "62XXXXXXXXXXX",
metaPixelId: "",
```

Contoh nomor outlet WhatsApp harus format internasional tanpa tanda plus:

```js
whatsappNumber: "6281234567890",
```

Kalau belum punya Meta Pixel, biarkan:

```js
metaPixelId: "",
```

### 2. `assets/voucher-template.png`

Letakkan gambar template voucher final di:

```txt
assets/voucher-template.png
```

Nama file harus persis seperti itu.

Website tidak mengubah template. Canvas hanya menambahkan:

- KODE VOUCHER
- TANGGAL CLAIM
- BERLAKU SAMPAI

### 3. Koordinat teks voucher

Koordinat ada di `js/config.js`, bagian `VOUCHER_STYLE`.

Nilai `x` dan `y` bisa memakai angka 0 sampai 1.

Contoh:

```js
x: 0.5
```

Artinya posisi tengah lebar gambar.

Jika kode terlalu tinggi/rendah, ubah `y`.
Jika kode terlalu kiri/kanan, ubah `x`.
Jika ukuran teks kurang pas, ubah `fontSize`.

## Cara setup Supabase

1. Buka [Supabase](https://supabase.com/).
2. Buat project baru.
3. Masuk ke menu SQL Editor.
4. Buka file `supabase/setup.sql` dari project ini.
5. Copy seluruh isi file SQL tersebut.
6. Paste ke SQL Editor Supabase.
7. Klik Run.

SQL ini membuat:

- tabel `voucher_claims`
- tabel `admin_users`
- function `claim_voucher`
- validasi nomor WhatsApp
- unique constraint `whatsapp + claim_day`
- unique constraint `voucher_code`
- RLS supaya visitor public tidak bisa melihat semua customer

## Ambil Supabase URL dan anon key

1. Di Supabase, buka Project Settings.
2. Buka API.
3. Copy Project URL.
4. Paste ke `supabaseUrl` di `js/config.js`.
5. Copy anon public key.
6. Paste ke `supabaseAnonKey` di `js/config.js`.

Jangan pernah memakai service role key di frontend.

## Setup admin dashboard

Dashboard ada di:

```txt
admin.html
```

Untuk membuat admin:

1. Di Supabase, buka Authentication.
2. Buat user admin dengan email dan password.
3. Buka SQL Editor.
4. Jalankan SQL ini, ganti emailnya:

```sql
insert into public.admin_users (user_id, email)
select id, email from auth.users
where email = 'admin@example.com'
on conflict (user_id) do nothing;
```

Hanya user yang ada di `admin_users` yang bisa membaca daftar claim.

## Cara test lokal

Karena project ini static, cara paling mudah:

1. Buka folder project.
2. Klik dua kali `index.html`.
3. Isi nama dan nomor WhatsApp.
4. Klik `CLAIM VOUCHER GRATIS`.

Kalau browser memblokir beberapa fitur, jalankan local server sederhana:

```bash
python -m http.server 8000
```

Lalu buka:

```txt
http://localhost:8000
```

## Checklist test

### TEST 1 - Nomor baru claim hari ini

Isi nomor baru, lalu claim.

Hasil yang benar:

- voucher berhasil dibuat
- data masuk ke Supabase
- kode format `CITOS-FR-XXXXX`

### TEST 2 - Nomor sama claim lagi di hari yang sama

Claim lagi dengan nomor yang sama pada tanggal kalender WITA yang sama.

Hasil yang benar:

- tidak membuat voucher baru
- voucher existing ditampilkan lagi
- pesan muncul bahwa voucher baru bisa claim besok

### TEST 3 - Nomor sama pada hari berikutnya

Contoh:

- claim pertama: 2 September 2026
- claim berikutnya: 3 September 2026

Hasil yang benar:

- boleh claim lagi
- kode voucher baru dibuat

### TEST 4 - Normalisasi WhatsApp

Coba:

```txt
081234567890
6281234567890
```

Hasil yang benar:

- dianggap nomor yang sama
- hanya boleh 1 claim pada hari yang sama

### TEST 5 - Double-click

Tekan tombol claim beberapa kali cepat.

Hasil yang benar:

- tombol disable saat loading
- database tetap hanya punya 1 voucher untuk nomor tersebut pada hari itu

### TEST 6 - Kode voucher unik

Claim beberapa nomor berbeda.

Hasil yang benar:

- semua `voucher_code` berbeda

### TEST 7 sampai TEST 10 - Canvas dan PNG

Pastikan `assets/voucher-template.png` sudah ada.

Hasil yang benar:

- template muncul penuh, tidak crop
- kode voucher muncul di area kosong
- tanggal claim dan expired muncul di area kosong
- tombol download menghasilkan PNG

### TEST 11 - WhatsApp

Klik `SIMPAN VOUCHER & BUKA WHATSAPP`.

Hasil yang benar:

- PNG didownload atau bisa disimpan manual
- WhatsApp terbuka
- pesan berisi nama dan kode voucher yang benar

### TEST 12 - UTM

Buka URL seperti ini:

```txt
index.html?utm_source=instagram&utm_medium=paid_social&utm_campaign=free_room&utm_content=story_ad
```

Hasil yang benar:

- UTM tersimpan di Supabase

### TEST 13 - Visitor public tidak bisa lihat daftar customer

Tanpa login admin, buka `admin.html`.

Hasil yang benar:

- harus login
- data customer tidak tampil

### TEST 14 - Admin authenticated bisa lihat dashboard

Login di `admin.html` memakai akun admin.

Hasil yang benar:

- metrik tampil
- tabel claim tampil
- search, filter tanggal, dan export CSV bisa dipakai

## Cara push ke GitHub

Di dalam folder `happy-puppy-citos-voucher`, jalankan:

```bash
git init
git add .
git commit -m "Initial voucher system"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

Ganti `USERNAME` dan `NAMA-REPO` sesuai repository GitHub kamu.

## Cara aktifkan GitHub Pages

1. Buka repository di GitHub.
2. Masuk ke Settings.
3. Buka Pages.
4. Pada Source, pilih `Deploy from a branch`.
5. Branch pilih `main`.
6. Folder pilih `/root`.
7. Klik Save.
8. Tunggu sampai GitHub memberi URL Pages.
9. Buka URL tersebut dari HP.

## Setelah live

Test dari HP:

1. Claim voucher.
2. Claim ulang nomor yang sama.
3. Download voucher.
4. Buka WhatsApp.
5. Login admin.
6. Export CSV.

Setelah semua aman, pasang URL GitHub Pages ke Instagram Ads.

## Catatan penting

- Voucher benar-benar gratis.
- Customer tidak perlu login.
- Tidak ada minimum transaksi.
- Tidak ada minimum F&B.
- 1 voucher berlaku untuk 1 room.
- Voucher Free Room tidak dapat digabungkan.
- Service role key tidak boleh dimasukkan ke file JavaScript.
