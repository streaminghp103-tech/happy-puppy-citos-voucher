create extension if not exists pgcrypto;

create table if not exists public.voucher_claims (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  whatsapp text not null,
  voucher_code text not null unique,
  claim_date date not null,
  claim_time time not null,
  claim_day date not null,
  expires_at date not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now(),
  constraint voucher_claims_whatsapp_claim_day_key unique (whatsapp, claim_day),
  constraint voucher_claims_whatsapp_format_check check (whatsapp ~ '^628[1-9][0-9]{7,11}$')
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.page_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  page_path text,
  visit_day date not null,
  claimed_at timestamptz,
  claim_id uuid references public.voucher_claims(id) on delete set null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint page_visits_visitor_day_key unique (visitor_id, visit_day)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voucher-assets',
  'voucher-assets',
  true,
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.voucher_claims enable row level security;
alter table public.admin_users enable row level security;
alter table public.campaign_settings enable row level security;
alter table public.page_visits enable row level security;

drop policy if exists "Admins can read voucher claims" on public.voucher_claims;
create policy "Admins can read voucher claims"
on public.voucher_claims
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
);

drop policy if exists "Admins can read page visits" on public.page_visits;
create policy "Admins can read page visits"
on public.page_visits
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
);

drop policy if exists "Admins can read admin users" on public.admin_users;
create policy "Admins can read admin users"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Anyone can read campaign settings" on public.campaign_settings;
create policy "Anyone can read campaign settings"
on public.campaign_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert campaign settings" on public.campaign_settings;
create policy "Admins can insert campaign settings"
on public.campaign_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
);

drop policy if exists "Admins can update campaign settings" on public.campaign_settings;
create policy "Admins can update campaign settings"
on public.campaign_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
);

drop policy if exists "Anyone can read voucher asset files" on storage.objects;
create policy "Anyone can read voucher asset files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'voucher-assets');

drop policy if exists "Admins can upload voucher asset files" on storage.objects;
create policy "Admins can upload voucher asset files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'voucher-assets'
  and exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
);

drop policy if exists "Admins can update voucher asset files" on storage.objects;
create policy "Admins can update voucher asset files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'voucher-assets'
  and exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'voucher-assets'
  and exists (
    select 1
    from public.admin_users admin
    where admin.user_id = auth.uid()
  )
);

create or replace function public.normalize_indonesia_whatsapp(input_text text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(input_text, ''), '\D', '', 'g');

  if digits like '0%' then
    digits := '62' || substr(digits, 2);
  elsif digits like '8%' then
    digits := '62' || digits;
  end if;

  return digits;
end;
$$;

create or replace function public.generate_voucher_code(prefix text)
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text := '';
  i int;
begin
  for i in 1..5 loop
    code := code || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
  end loop;

  return upper(prefix) || '-' || code;
end;
$$;

create or replace function public.record_page_visit(
  p_visitor_id text,
  p_page_path text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visitor_id text;
  v_now_wita timestamp;
  v_visit_day date;
  v_visit_id uuid;
begin
  v_visitor_id := nullif(trim(p_visitor_id), '');
  if v_visitor_id is null then
    raise exception 'Visitor ID kosong.';
  end if;

  v_now_wita := timezone('Asia/Makassar', now());
  v_visit_day := v_now_wita::date;

  insert into public.page_visits (
    visitor_id,
    page_path,
    visit_day,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content
  )
  values (
    v_visitor_id,
    nullif(trim(p_page_path), ''),
    v_visit_day,
    nullif(trim(p_utm_source), ''),
    nullif(trim(p_utm_medium), ''),
    nullif(trim(coalesce(p_utm_campaign, 'happy-puppy-citos-free-room')), ''),
    nullif(trim(p_utm_content), '')
  )
  on conflict (visitor_id, visit_day) do update
  set
    last_seen_at = now(),
    page_path = coalesce(excluded.page_path, page_visits.page_path),
    utm_source = coalesce(page_visits.utm_source, excluded.utm_source),
    utm_medium = coalesce(page_visits.utm_medium, excluded.utm_medium),
    utm_campaign = coalesce(page_visits.utm_campaign, excluded.utm_campaign),
    utm_content = coalesce(page_visits.utm_content, excluded.utm_content)
  returning id into v_visit_id;

  return v_visit_id;
end;
$$;

create or replace function public.mark_page_visit_claimed(
  p_visitor_id text,
  p_claim_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visitor_id text;
  v_now_wita timestamp;
  v_visit_day date;
begin
  v_visitor_id := nullif(trim(p_visitor_id), '');
  if v_visitor_id is null then
    return;
  end if;

  v_now_wita := timezone('Asia/Makassar', now());
  v_visit_day := v_now_wita::date;

  update public.page_visits
  set
    claimed_at = coalesce(claimed_at, now()),
    claim_id = coalesce(p_claim_id, claim_id),
    last_seen_at = now()
  where visitor_id = v_visitor_id
    and visit_day = v_visit_day;
end;
$$;

drop function if exists public.claim_voucher(text, text, text, text, text, text);
drop function if exists public.claim_voucher(text, text, text, text, int, date, text, text, text, text);

create function public.claim_voucher(
  p_customer_name text,
  p_whatsapp text,
  p_voucher_prefix text default 'CITOS-FR',
  p_expiry_mode text default 'days',
  p_expiry_days int default 30,
  p_fixed_expiry_date date default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null
)
returns table (
  id uuid,
  customer_name text,
  whatsapp text,
  voucher_code text,
  claim_date date,
  claim_time time,
  claim_day date,
  expires_at date,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  already_claimed boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_whatsapp text;
  v_now_wita timestamp;
  v_claim_day date;
  v_expires_at date;
  v_prefix text;
  v_expiry_days int;
  v_code text;
  v_existing voucher_claims%rowtype;
  v_inserted voucher_claims%rowtype;
  v_try int := 0;
begin
  v_name := nullif(trim(p_customer_name), '');
  if v_name is null then
    raise exception 'Nama wajib diisi.';
  end if;

  v_whatsapp := normalize_indonesia_whatsapp(p_whatsapp);
  if v_whatsapp !~ '^628[1-9][0-9]{7,11}$' then
    raise exception 'Nomor WhatsApp belum valid.';
  end if;

  v_now_wita := timezone('Asia/Makassar', now());
  v_claim_day := v_now_wita::date;
  v_prefix := upper(nullif(regexp_replace(coalesce(p_voucher_prefix, 'CITOS-FR'), '[^A-Za-z0-9-]', '', 'g'), ''));
  if v_prefix is null then
    v_prefix := 'CITOS-FR';
  end if;

  v_expiry_days := greatest(1, least(coalesce(p_expiry_days, 30), 365));
  if p_expiry_mode = 'fixed_date' and p_fixed_expiry_date is not null then
    v_expires_at := p_fixed_expiry_date;
  else
    v_expires_at := v_claim_day + (v_expiry_days || ' days')::interval;
  end if;

  select *
  into v_existing
  from public.voucher_claims vc
  where vc.whatsapp = v_whatsapp
    and vc.claim_day = v_claim_day
  limit 1;

  if found then
    return query
    select
      v_existing.id,
      v_existing.customer_name,
      v_existing.whatsapp,
      v_existing.voucher_code,
      v_existing.claim_date,
      v_existing.claim_time,
      v_existing.claim_day,
      v_existing.expires_at,
      v_existing.utm_source,
      v_existing.utm_medium,
      v_existing.utm_campaign,
      v_existing.utm_content,
      true,
      v_existing.created_at;
    return;
  end if;

  loop
    v_try := v_try + 1;
    v_code := generate_voucher_code(v_prefix);

    begin
      insert into public.voucher_claims (
        customer_name,
        whatsapp,
        voucher_code,
        claim_date,
        claim_time,
        claim_day,
        expires_at,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content
      )
      values (
        v_name,
        v_whatsapp,
        v_code,
        v_claim_day,
        v_now_wita::time,
        v_claim_day,
        v_expires_at,
        nullif(trim(p_utm_source), ''),
        nullif(trim(p_utm_medium), ''),
        nullif(trim(coalesce(p_utm_campaign, 'happy-puppy-citos-free-room')), ''),
        nullif(trim(p_utm_content), '')
      )
      returning * into v_inserted;

      return query
      select
        v_inserted.id,
        v_inserted.customer_name,
        v_inserted.whatsapp,
        v_inserted.voucher_code,
        v_inserted.claim_date,
        v_inserted.claim_time,
        v_inserted.claim_day,
        v_inserted.expires_at,
        v_inserted.utm_source,
        v_inserted.utm_medium,
        v_inserted.utm_campaign,
        v_inserted.utm_content,
        false,
        v_inserted.created_at;
      return;
    exception
      when unique_violation then
        select *
        into v_existing
        from public.voucher_claims vc
        where vc.whatsapp = v_whatsapp
          and vc.claim_day = v_claim_day
        limit 1;

        if found then
          return query
          select
            v_existing.id,
            v_existing.customer_name,
            v_existing.whatsapp,
            v_existing.voucher_code,
            v_existing.claim_date,
            v_existing.claim_time,
            v_existing.claim_day,
            v_existing.expires_at,
            v_existing.utm_source,
            v_existing.utm_medium,
            v_existing.utm_campaign,
            v_existing.utm_content,
            true,
            v_existing.created_at;
          return;
        end if;

        if v_try >= 12 then
          raise exception 'Kode voucher belum bisa dibuat. Silakan coba lagi.';
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.claim_voucher(text, text, text, text, int, date, text, text, text, text) from public;
grant execute on function public.claim_voucher(text, text, text, text, int, date, text, text, text, text) to anon, authenticated;
revoke all on function public.record_page_visit(text, text, text, text, text, text) from public;
grant execute on function public.record_page_visit(text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.mark_page_visit_claimed(text, uuid) from public;
grant execute on function public.mark_page_visit_claimed(text, uuid) to anon, authenticated;

revoke all on public.voucher_claims from anon;
revoke all on public.voucher_claims from authenticated;
revoke all on public.page_visits from anon;
revoke all on public.page_visits from authenticated;
grant select on public.voucher_claims to authenticated;
grant select on public.page_visits to authenticated;
grant select on public.campaign_settings to anon, authenticated;
grant insert, update on public.campaign_settings to authenticated;

insert into public.campaign_settings (setting_key, setting_value)
values
  ('whatsappNumber', '6285348773757'),
  ('voucherPrefix', 'HP103-FR'),
  ('expiryMode', 'days'),
  ('expiryDays', '30'),
  ('fixedExpiryDate', ''),
  ('templatePath', 'assets/voucher-template.png'),
  ('whatsappMessageTemplate', 'Halo Happy Puppy Citos

Saya sudah claim Voucher GRATIS KARAOKE 1 JAM

Nama: {nama}
Kode Voucher: {kode}
Tanggal Claim: {tanggal_claim}
Berlaku Sampai: {tanggal_expired}

Saya akan melampirkan foto voucher yang baru saja tersimpan di HP saya.

Saya ingin menggunakan voucher ini untuk karaoke di Happy Puppy Citos.')
on conflict (setting_key) do nothing;

-- Setelah membuat user admin di Supabase Auth, jalankan contoh ini dengan email admin asli:
-- insert into public.admin_users (user_id, email)
-- select id, email from auth.users where email = 'admin@example.com'
-- on conflict (user_id) do nothing;
