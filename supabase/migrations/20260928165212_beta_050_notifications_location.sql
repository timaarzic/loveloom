-- LoveLoom beta 0.5 hotfix: durable unread counters and push subscription repair.

create table public.loveloom_chat_reads (
  room_id uuid not null,
  user_id uuid not null,
  last_read_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint loveloom_chat_reads_membership_fkey
    foreign key (room_id, user_id)
    references public.loveloom_room_members(room_id, user_id)
    on delete cascade,
  constraint loveloom_chat_reads_nonnegative check (last_read_seq >= 0)
);

create index loveloom_chat_reads_user_idx
  on public.loveloom_chat_reads(user_id);

alter table public.loveloom_chat_reads enable row level security;
revoke all on table public.loveloom_chat_reads from public, anon, authenticated;

-- Existing conversations start as read so the hotfix does not create a badge
-- for the whole historical chat. New partner messages increment it normally.
insert into public.loveloom_chat_reads(room_id, user_id, last_read_seq)
select
  member.room_id,
  member.user_id,
  coalesce(max(message.seq), 0)
from public.loveloom_room_members member
left join public.loveloom_messages message on message.room_id = member.room_id
group by member.room_id, member.user_id
on conflict (room_id, user_id) do nothing;

create or replace function public.loveloom_chat_unread(p_epoch integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_last_read bigint := 0;
  v_latest bigint := 0;
  v_unread integer := 0;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);

  select coalesce(read_state.last_read_seq, 0)
    into v_last_read
  from public.loveloom_chat_reads read_state
  where read_state.room_id = v_room_id
    and read_state.user_id = v_uid;
  v_last_read := coalesce(v_last_read, 0);

  select
    coalesce(max(message.seq), 0),
    count(*) filter (
      where message.author_id <> v_uid
        and message.seq > v_last_read
    )::integer
  into v_latest, v_unread
  from public.loveloom_messages message
  where message.room_id = v_room_id;

  return jsonb_build_object(
    'unread', coalesce(v_unread, 0),
    'latestSeq', coalesce(v_latest, 0),
    'epoch', p_epoch
  );
end;
$$;

create or replace function public.loveloom_mark_chat_read(
  p_epoch integer,
  p_last_seq bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_latest bigint := 0;
  v_safe_seq bigint := 0;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  if p_last_seq is null or p_last_seq < 0 then
    raise exception 'Некорректная отметка прочтения.';
  end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);

  select coalesce(max(message.seq), 0)
    into v_latest
  from public.loveloom_messages message
  where message.room_id = v_room_id;
  v_safe_seq := least(p_last_seq, v_latest);

  insert into public.loveloom_chat_reads(room_id, user_id, last_read_seq)
  values (v_room_id, v_uid, v_safe_seq)
  on conflict (room_id, user_id) do update set
    last_read_seq = greatest(
      public.loveloom_chat_reads.last_read_seq,
      excluded.last_read_seq
    ),
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'lastReadSeq', v_safe_seq,
    'epoch', p_epoch
  );
end;
$$;

create or replace function public.loveloom_has_push_subscription(
  p_endpoint text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  return exists (
    select 1
    from public.loveloom_push_subscriptions subscription
    where subscription.user_id = v_uid
      and subscription.endpoint = btrim(coalesce(p_endpoint, ''))
  );
end;
$$;

revoke all on function public.loveloom_chat_unread(integer)
  from public, anon;
revoke all on function public.loveloom_mark_chat_read(integer, bigint)
  from public, anon;
revoke all on function public.loveloom_has_push_subscription(text)
  from public, anon;

grant execute on function public.loveloom_chat_unread(integer)
  to authenticated;
grant execute on function public.loveloom_mark_chat_read(integer, bigint)
  to authenticated;
grant execute on function public.loveloom_has_push_subscription(text)
  to authenticated;

comment on table public.loveloom_chat_reads is
  'Per-member chat read cursor used for a durable unread badge across devices.';
