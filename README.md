# ✦ VELX — Universal Real-Time AI Project Command Center

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Supabase Realtime](https://img.shields.io/badge/Supabase-Realtime-emerald?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%20v4-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![Vercel Ready](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/)

> **VELX** adalah platform manajemen proyek modern bertenaga AI dengan sinkronisasi basis data **Real-Time 100% menggunakan Supabase PostgreSQL** (bukan data demo statis). Dirancang dengan sepenuh hati untuk membantu pengguna mewujudkan ide menjadi kenyataan melalui alur terstruktur: *Discovery*, *Blueprint*, *Eksekusi Tugas*, *Memori AI*, dan *Pelaporan*.

---

## 🌟 Fitur Utama (Core Highlights)

### 1. 🚀 Tampilan Awal Interaktif dengan Tombol "Mulai"
Pengunjung pertama kali disambut oleh antarmuka landing page futuristik beresolusi tinggi dengan indikator real-time live, ringkasan arsitektur, dan tombol CTA **"Mulai Sekarang"** yang membawa pengguna langsung masuk ke Command Center.

### 2. ⚡ Sinkronisasi Real-Time (Tanpa Data Demo)
- Seluruh tugas (*tasks*), obrolan (*ai_messages*), dan status proyek tersambung langsung ke tabel Supabase.
- Menggunakan channel WebSocket `postgres_changes` untuk menyinkronkan setiap penambahan tugas, perubahan status, dan pesan secara instan di semua tab dan perangkat tanpa perlu reload halaman.

### 3. 🧠 VELX AI Context Intelligence
- AI asisten yang memahami konteks proyek berjalan secara real-time.
- Menganalisis tugas prioritas tinggi berikutnya (*focus recommendation*) dan memandu pemecahan blocker.

### 4. 📊 Metrik & Progres Dinamis
- Donut chart progres yang dikalkulasikan secara otomatis dari data riil di database.
- Breakdown status tugas: *To do*, *In progress*, *Review*, dan *Done*.

---

## 🏗️ Arsitektur Proyek

```
velx/
├── app/
│   ├── globals.css          # Styling kustom & Tailwind CSS (Dark Cyberpunk Theme)
│   ├── layout.tsx           # Root Layout Next.js
│   └── page.tsx             # Halaman Utama (Tampilan Landing + Real-Time Workspace)
├── lib/
│   ├── ai/
│   │   └── provider.ts      # Kontrak abstrak AI Provider
│   └── supabase/
│       ├── client.ts        # Supabase Client Browser (Real-Time & Config Store)
│       └── server.ts        # Supabase Server Client untuk Server Components
├── supabase/
│   └── migrations/
│       └── 20261103000000_velx_mvp.sql  # Skema PostgreSQL, RLS, & Publication Realtime
├── public/                  # Static assets & favicon
├── .env.example             # Template variabel lingkungan
└── package.json             # Dependensi & skrip Next.js
```

---

## 🚀 Menjalankan Proyek Secara Lokal

### 1. Clone Repository
```bash
git clone https://github.com/USERNAME/velx.git
cd velx
```

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Lingkungan (`.env.local`)
Buat file `.env.local` di root direktori dengan menyalin dari `.env.example`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://proyek-anda.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=kunci-anon-anda
```

*(Catatan: Anda juga dapat memasukkan kredensial Supabase secara langsung melalui menu modal ⚙ **Supabase** di antarmuka web).*

### 4. Jalankan Development Server
```bash
npm run dev
```
Buka [http://localhost:3000](http://localhost:3000) di browser Anda.

---

## 🗄️ Menyiapkan Database Supabase Real-Time

1. Buat proyek baru di [Supabase Console](https://supabase.com/dashboard).
2. Buka menu **SQL Editor**.
3. Buka file `supabase/migrations/20261103000000_velx_mvp.sql`, salin seluruh isinya, dan klik **Run**.
4. Skrip tersebut secara otomatis:
   - Membuat tabel `projects`, `tasks`, `ai_messages`, dan `project_blueprints`.
   - Mengaktifkan Row Level Security (RLS) ramah portofolio publik.
   - Mengaktifkan `REPLICA IDENTITY FULL` untuk perubahan real-time.
   - Menambahkan tabel ke publikasi `supabase_realtime`.
   - Mengisi data live awal yang siap langsung digunakan.
5. Salin **Project URL** dan **anon public key** dari menu **Project Settings > API**, lalu masukkan ke `.env.local` atau tombol konfigurasi di aplikasi.

---

## 🌐 Panduan Deploy ke Vercel

1. Buka [Vercel Dashboard](https://vercel.com/) dan klik **Add New Project**.
2. Hubungkan repository GitHub **velx** Anda.
3. Pada bagian **Environment Variables**, tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL` : URL proyek Supabase Anda.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` : Kunci anon publik Supabase Anda.
4. Klik **Deploy**. Website Anda akan aktif dan online secara real-time dalam hitungan detik!

---

## 💻 Tech Stack
- **Framework**: Next.js 16 (App Router)
- **UI Library**: React 19
- **Database & Realtime**: Supabase (PostgreSQL & WebSockets)
- **Styling**: Tailwind CSS & Custom CSS Themes
- **Deployment**: Vercel

---

*Dibuat dengan sepenuh hati sebagai proyek portofolio teknologi mutakhir.*
