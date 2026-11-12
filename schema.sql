-- =====================================================
-- Log Pengerjaan WEDM - Supabase schema
-- Jalankan di Supabase Dashboard > SQL Editor
-- =====================================================

-- 1. MASTER: mesin
create table if not exists public.machines (
  id         bigint generated always as identity primary key,
  name       text not null unique,          -- contoh: Sodick 1
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. MASTER: customer
create table if not exists public.customers (
  id         bigint generated always as identity primary key,
  name       text not null unique,          -- contoh: Gesso 1
  created_at timestamptz not null default now()
);

-- 3. TRANSAKSI: pengerjaan (1 baris = 1 baris di kertas)
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  job_date    date not null default current_date,     -- kolom KETERANGAN (tanggal)
  pr_no       text not null,                          -- kolom PR, contoh: MW2 125
  item_size   text,                                   -- kolom ITEM, contoh: 16.37 x 117.06
  qty         integer not null default 1 check (qty > 0),
  start_time  time,                                   -- WAKTU mulai
  end_time    time,                                   -- WAKTU selesai (null = masih jalan)
  customer_id bigint references public.customers(id) on delete set null,
  machine_id  bigint references public.machines(id)  on delete set null,
  notes       text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists jobs_date_idx     on public.jobs (job_date desc);
create index if not exists jobs_pr_idx       on public.jobs (lower(pr_no));
create index if not exists jobs_customer_idx on public.jobs (customer_id);
create index if not exists jobs_machine_idx  on public.jobs (machine_id);

-- auto update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_jobs_updated on public.jobs;
create trigger trg_jobs_updated before update on public.jobs
for each row execute function public.set_updated_at();

-- 4. VIEW: gabungan + durasi (menit). Handle lewat tengah malam.
create or replace view public.jobs_view
with (security_invoker = true) as
select
  j.id, j.job_date, j.pr_no, j.item_size, j.qty,
  j.start_time, j.end_time,
  j.customer_id, c.name as customer_name,
  j.machine_id,  m.name as machine_name,
  j.notes, j.created_at,
  case
    when j.start_time is null or j.end_time is null then null
    when j.end_time >= j.start_time
      then (extract(epoch from (j.end_time - j.start_time)) / 60)::int
    else (extract(epoch from (j.end_time - j.start_time + interval '24 hours')) / 60)::int
  end as duration_min
from public.jobs j
left join public.customers c on c.id = j.customer_id
left join public.machines  m on m.id = j.machine_id;

-- 5. RLS: hanya user yang login yang boleh akses
alter table public.machines  enable row level security;
alter table public.customers enable row level security;
alter table public.jobs      enable row level security;

drop policy if exists "auth all machines"  on public.machines;
drop policy if exists "auth all customers" on public.customers;
drop policy if exists "auth all jobs"      on public.jobs;

create policy "auth all machines"  on public.machines  for all to authenticated using (true) with check (true);
create policy "auth all customers" on public.customers for all to authenticated using (true) with check (true);
create policy "auth all jobs"      on public.jobs      for all to authenticated using (true) with check (true);

-- 6. SEED (sesuai kertas)
insert into public.machines (name) values ('Sodick 1'), ('Sodick 2')
on conflict (name) do nothing;

insert into public.customers (name) values ('Gesso 1'), ('Gesso 2')
on conflict (name) do nothing;
