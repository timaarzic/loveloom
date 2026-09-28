-- LoveLoom beta 0.5: private Web Push subscriptions and server-side VAPID keys.

create table public.loveloom_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  expiration_time bigint,
  device_label text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loveloom_push_endpoint_length
    check (char_length(endpoint) between 20 and 2048),
  constraint loveloom_push_endpoint_https
    check (endpoint ~ '^https://'),
  constraint loveloom_push_p256dh_length
    check (char_length(p256dh) between 20 and 512),
  constraint loveloom_push_auth_length
    check (char_length(auth_secret) between 8 and 256),
  constraint loveloom_push_device_label_length
    check (char_length(device_label) <= 180)
);

create index loveloom_push_subscriptions_user_updated_idx
  on public.loveloom_push_subscriptions(user_id, updated_at desc);

-- The key pair never leaves the server. The public half is returned by the
-- authenticated Edge Function when a browser asks to subscribe.
create table public.loveloom_push_vapid (
  singleton boolean primary key default true check (singleton),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now(),
  constraint loveloom_push_vapid_public_length
    check (char_length(public_key) between 40 and 256),
  constraint loveloom_push_vapid_private_length
    check (char_length(private_key) between 20 and 256)
);

create table public.loveloom_push_deliveries (
  message_id uuid primary key references public.loveloom_messages(id) on delete cascade,
  delivered_at timestamptz not null default now()
);

alter table public.loveloom_push_subscriptions enable row level security;
alter table public.loveloom_push_vapid enable row level security;
alter table public.loveloom_push_deliveries enable row level security;

revoke all on table public.loveloom_push_subscriptions from public, anon, authenticated;
revoke all on table public.loveloom_push_vapid from public, anon, authenticated;
revoke all on table public.loveloom_push_deliveries from public, anon, authenticated;

create or replace function public.loveloom_upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_expiration_time bigint,
  p_device_label text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh text := btrim(coalesce(p_p256dh, ''));
  v_auth text := btrim(coalesce(p_auth, ''));
  v_label text := left(btrim(coalesce(p_device_label, '')), 180);
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  if not exists (
    select 1 from public.loveloom_room_members where user_id = v_uid
  ) then
    raise exception 'Сначала войдите в комнату.';
  end if;
  if char_length(v_endpoint) not between 20 and 2048
     or v_endpoint !~ '^https://'
     or char_length(v_p256dh) not between 20 and 512
     or char_length(v_auth) not between 8 and 256 then
    raise exception 'Некорректная подписка уведомлений.';
  end if;

  insert into public.loveloom_push_subscriptions(
    user_id, endpoint, p256dh, auth_secret, expiration_time, device_label
  ) values (
    v_uid, v_endpoint, v_p256dh, v_auth, p_expiration_time, v_label
  )
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    expiration_time = excluded.expiration_time,
    device_label = excluded.device_label,
    updated_at = now();

  delete from public.loveloom_push_subscriptions old
  where old.id in (
    select item.id
    from public.loveloom_push_subscriptions item
    where item.user_id = v_uid
    order by item.updated_at desc
    offset 5
  );
  return true;
end;
$$;

create or replace function public.loveloom_remove_push_subscription(
  p_endpoint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  delete from public.loveloom_push_subscriptions
  where user_id = v_uid and endpoint = btrim(coalesce(p_endpoint, ''));
  return true;
end;
$$;

revoke all on function public.loveloom_upsert_push_subscription(text, text, text, bigint, text)
  from public, anon;
revoke all on function public.loveloom_remove_push_subscription(text)
  from public, anon;
grant execute on function public.loveloom_upsert_push_subscription(text, text, text, bigint, text)
  to authenticated;
grant execute on function public.loveloom_remove_push_subscription(text)
  to authenticated;

comment on table public.loveloom_push_subscriptions is
  'Private per-device Web Push endpoints. Users can mutate only their own endpoints through validated RPCs.';
comment on table public.loveloom_push_vapid is
  'Server-only VAPID key pair generated by the LoveLoom push Edge Function.';
