# Seed data demo — Relay

Data demo untuk situs dev `harimauameh12.atlassian.net` (file `seed-data.json`):

- **Proyek:** RELAY — "Relay Demo" (1 proyek contoh).
- **User (3):** Ana (Backend, payments — **away**, cuti s.d. 2026-12-05),
  Budi (Backend — pernah mengerjakan payments), Citra (Frontend).
- **Issue (15):** RELAY-1..15, berbagai status (To Do / In Progress / In Review /
  Done) dan prioritas. 6 issue milik Ana yang away → itulah yang harus muncul
  di Orphan Radar setelah seed.
- **Confluence (2 halaman):** "Payments onboarding runbook" dan
  "Release checklist" (untuk handover packet, stretch Fase 2).

## Cara seed (manual, dari browser — ±10 menit)

1. Di situs dev, buat proyek Jira baru key **RELAY** (tipe Team-managed,
   template Scrum atau Kanban).
2. Undang / buat 2 user tambahan bila belum ada (Budi, Citra) — atau pakai
   nama anggota yang sudah ada di situs dan sesuaikan nama di file ini.
3. Buat 15 issue sesuai `seed-data.json` (summary, status, prioritas,
   assignee). Issue Done (RELAY-9, RELAY-14) sengaja ada untuk membuktikan
   Radar hanya menampilkan yang masih terbuka.
4. Buat 2 halaman Confluence di space RELAY sesuai daftar di atas.
5. Setelah app Relay ter-install: buka Radar, tandai Ana "away" dengan
   tanggal kembali 2026-12-05 (tombol away-flag ada di Fase 2; sementara
   flag bisa di-set lewat resolver `setAwayFlag` dari `forge tunnel`).

## Kenapa data ini

- Ana punya 6 issue terbuka dengan prioritas campur → Radar menampilkan
  peringkat risiko yang berbeda-beda (RELAY-1 Highest harus di atas).
- Budi punya riwayat di payments → dia harus jadi successor teratas untuk
  issue Ana (alasan: "Resolved related work in this project").
- Citra tidak punya riwayat payments → dia tidak boleh jadi successor
  teratas untuk issue payments Ana.
- 2 issue Done membuktikan filter "hanya yang terbuka".
