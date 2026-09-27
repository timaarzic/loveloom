-- LoveLoom cloud beta: isolated pair rooms, shared content and secure RPC API.
-- All public tables use RLS. Mutations are exposed only through the validated
-- security-definer functions at the bottom of this migration.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.loveloom_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint loveloom_profiles_name_length
    check (char_length(btrim(display_name)) between 1 and 40)
);

create table public.loveloom_rooms (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  code_digest text not null unique,
  code_secret_id uuid not null unique references vault.secrets(id),
  relationship_started_on date,
  timezone text not null default 'Europe/Moscow',
  epoch integer not null default 1,
  created_at timestamptz not null default now(),
  constraint loveloom_rooms_code_digest_format
    check (code_digest ~ '^[0-9a-f]{64}$'),
  constraint loveloom_rooms_epoch_positive check (epoch > 0),
  constraint loveloom_rooms_timezone_supported check (
    timezone in (
      'Europe/Moscow',
      'Europe/Istanbul',
      'Asia/Yekaterinburg',
      'Asia/Almaty',
      'Asia/Yerevan',
      'UTC'
    )
  )
);

create table public.loveloom_room_members (
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null,
  nickname text not null default '',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint loveloom_room_members_role check (role in ('creator', 'member')),
  constraint loveloom_room_members_nickname_length
    check (char_length(nickname) <= 40)
);

create unique index loveloom_room_one_creator_idx
  on public.loveloom_room_members(room_id)
  where role = 'creator';

create table public.loveloom_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  event_date date,
  is_done boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loveloom_entries_kind check (
    kind in ('event', 'memory', 'note', 'wish', 'movie', 'music')
  ),
  constraint loveloom_entries_title_length
    check (char_length(btrim(title)) between 1 and 140),
  constraint loveloom_entries_body_length check (char_length(body) <= 4000),
  constraint loveloom_entries_version_positive check (version > 0),
  constraint loveloom_entries_event_has_date
    check (kind <> 'event' or event_date is not null)
);

create index loveloom_entries_room_created_idx
  on public.loveloom_entries(room_id, created_at desc);
create index loveloom_entries_author_idx
  on public.loveloom_entries(author_id);

create table public.loveloom_messages (
  seq bigint generated always as identity primary key,
  id uuid not null unique default gen_random_uuid(),
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint loveloom_messages_body_length
    check (char_length(btrim(body)) between 1 and 4000)
);

create index loveloom_messages_room_seq_idx
  on public.loveloom_messages(room_id, seq desc);
create index loveloom_messages_author_idx
  on public.loveloom_messages(author_id);

create table public.loveloom_locations (
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude numeric(4, 1) not null,
  longitude numeric(4, 1) not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  constraint loveloom_locations_latitude check (latitude between -90 and 90),
  constraint loveloom_locations_longitude check (longitude between -180 and 180)
);

create index loveloom_locations_user_idx
  on public.loveloom_locations(user_id);

create table public.loveloom_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  kind text not null,
  question text not null,
  choices jsonb not null,
  created_at timestamptz not null default now(),
  constraint loveloom_games_kind check (kind in ('know', 'quiz', 'either', 'date')),
  constraint loveloom_games_question_length
    check (char_length(question) between 1 and 500),
  constraint loveloom_games_choices_array check (jsonb_typeof(choices) = 'array')
);

create index loveloom_games_room_created_idx
  on public.loveloom_games(room_id, created_at desc);

create table public.loveloom_game_answers (
  game_id uuid not null references public.loveloom_games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, user_id),
  constraint loveloom_game_answers_object check (jsonb_typeof(answer) = 'object')
);

create index loveloom_game_answers_user_idx
  on public.loveloom_game_answers(user_id);

create table private.loveloom_join_attempts (
  user_id uuid primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now()
);

alter table public.loveloom_profiles enable row level security;
alter table public.loveloom_rooms enable row level security;
alter table public.loveloom_room_members enable row level security;
alter table public.loveloom_entries enable row level security;
alter table public.loveloom_messages enable row level security;
alter table public.loveloom_locations enable row level security;
alter table public.loveloom_games enable row level security;
alter table public.loveloom_game_answers enable row level security;

create or replace function private.loveloom_is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loveloom_room_members m
    where m.room_id = p_room_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.loveloom_shares_room(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loveloom_room_members mine
    join public.loveloom_room_members theirs
      on theirs.room_id = mine.room_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_other_user_id
  );
$$;

revoke all on function private.loveloom_is_room_member(uuid) from public;
revoke all on function private.loveloom_shares_room(uuid) from public;
grant execute on function private.loveloom_is_room_member(uuid) to authenticated;
grant execute on function private.loveloom_shares_room(uuid) to authenticated;

create policy loveloom_profiles_select_pair
on public.loveloom_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or private.loveloom_shares_room(user_id)
);

create policy loveloom_rooms_select_member
on public.loveloom_rooms for select to authenticated
using (private.loveloom_is_room_member(id));

create policy loveloom_room_members_select_member
on public.loveloom_room_members for select to authenticated
using (private.loveloom_is_room_member(room_id));

create policy loveloom_entries_select_member
on public.loveloom_entries for select to authenticated
using (private.loveloom_is_room_member(room_id));

create policy loveloom_messages_select_member
on public.loveloom_messages for select to authenticated
using (private.loveloom_is_room_member(room_id));

create policy loveloom_locations_select_member
on public.loveloom_locations for select to authenticated
using (private.loveloom_is_room_member(room_id));

create policy loveloom_games_select_member
on public.loveloom_games for select to authenticated
using (private.loveloom_is_room_member(room_id));

create policy loveloom_game_answers_select_self
on public.loveloom_game_answers for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.loveloom_profiles from anon, authenticated;
revoke all on table public.loveloom_rooms from anon, authenticated;
revoke all on table public.loveloom_room_members from anon, authenticated;
revoke all on table public.loveloom_entries from anon, authenticated;
revoke all on table public.loveloom_messages from anon, authenticated;
revoke all on table public.loveloom_locations from anon, authenticated;
revoke all on table public.loveloom_games from anon, authenticated;
revoke all on table public.loveloom_game_answers from anon, authenticated;
revoke all on sequence public.loveloom_messages_seq_seq from anon, authenticated;

create or replace function private.loveloom_normalize_code(p_code text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_code !~ '^[A-Z0-9-]{10,64}$' then
    raise exception 'Пароль комнаты: от 10 до 64 символов, только буквы, цифры и дефисы.';
  end if;
  return v_code;
end;
$$;

create or replace function private.loveloom_require_room(
  p_user_id uuid,
  p_epoch integer default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_epoch integer;
begin
  select m.room_id, r.epoch
    into v_room_id, v_epoch
  from public.loveloom_room_members m
  join public.loveloom_rooms r on r.id = m.room_id
  where m.user_id = p_user_id;

  if v_room_id is null then
    raise exception 'Вы больше не состоите в комнате.';
  end if;
  if p_epoch is not null and p_epoch <> v_epoch then
    raise exception 'История комнаты изменилась. Обновите страницу.';
  end if;
  return v_room_id;
end;
$$;

revoke all on function private.loveloom_normalize_code(text) from public;
revoke all on function private.loveloom_require_room(uuid, integer) from public;

create or replace function private.loveloom_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  if v_name = '' then
    v_name := split_part(coalesce(new.email, 'Участник'), '@', 1);
  end if;
  v_name := left(v_name, 40);
  if v_name = '' then v_name := 'Участник'; end if;

  insert into public.loveloom_profiles(user_id, display_name)
  values (new.id, v_name)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists loveloom_on_auth_user_created on auth.users;
create trigger loveloom_on_auth_user_created
  after insert on auth.users
  for each row execute function private.loveloom_handle_new_user();

insert into public.loveloom_profiles(user_id, display_name)
select
  u.id,
  left(
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Участник'
    ),
    40
  )
from auth.users u
on conflict (user_id) do nothing;

create or replace function private.loveloom_remove_room_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.code_secret_id;
  return old;
end;
$$;

create trigger loveloom_after_room_deleted
  after delete on public.loveloom_rooms
  for each row execute function private.loveloom_remove_room_secret();

create or replace function public.loveloom_create_room(
  p_code text,
  p_start text,
  p_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_digest text;
  v_room_id uuid := gen_random_uuid();
  v_secret_id uuid;
  v_start date;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  if exists (
    select 1 from public.loveloom_room_members where user_id = v_uid
  ) then
    raise exception 'Аккаунт уже находится в комнате.';
  end if;

  v_code := private.loveloom_normalize_code(p_code);
  v_digest := encode(extensions.digest(v_code, 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_digest, 0));

  if exists (
    select 1 from public.loveloom_rooms where code_digest = v_digest
  ) then
    raise exception 'Этот пароль уже занят.';
  end if;

  if coalesce(p_start, '') <> '' then
    if p_start !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Некорректная дата.';
    end if;
    v_start := p_start::date;
    if v_start > current_date then
      raise exception 'Дата начала не может быть в будущем.';
    end if;
  end if;

  if p_timezone not in (
    'Europe/Moscow', 'Europe/Istanbul', 'Asia/Yekaterinburg',
    'Asia/Almaty', 'Asia/Yerevan', 'UTC'
  ) then
    raise exception 'Выберите доступный часовой пояс.';
  end if;

  v_secret_id := vault.create_secret(
    v_code,
    'loveloom_room_' || v_room_id::text,
    'Encrypted LoveLoom room invitation code'
  );

  insert into public.loveloom_rooms(
    id, creator_id, code_digest, code_secret_id,
    relationship_started_on, timezone
  ) values (
    v_room_id, v_uid, v_digest, v_secret_id, v_start, p_timezone
  );

  insert into public.loveloom_room_members(room_id, user_id, role)
  values (v_room_id, v_uid, 'creator');

  return v_room_id;
end;
$$;

create or replace function public.loveloom_join_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_digest text;
  v_room_id uuid;
  v_count integer;
  v_attempts integer;
  v_window timestamptz;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  if exists (
    select 1 from public.loveloom_room_members where user_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'Аккаунт уже находится в комнате.');
  end if;

  insert into private.loveloom_join_attempts(user_id, attempts, window_started_at)
  values (v_uid, 0, now())
  on conflict (user_id) do nothing;

  select attempts, window_started_at into v_attempts, v_window
  from private.loveloom_join_attempts
  where user_id = v_uid
  for update;

  if v_window < now() - interval '10 minutes' then
    update private.loveloom_join_attempts
      set attempts = 0, window_started_at = now()
    where user_id = v_uid;
    v_attempts := 0;
  end if;
  if v_attempts >= 10 then
    return jsonb_build_object('ok', false, 'error', 'Слишком много попыток. Подождите 10 минут.');
  end if;
  update private.loveloom_join_attempts
    set attempts = attempts + 1
  where user_id = v_uid;

  if v_code !~ '^[A-Z0-9-]{10,64}$' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Пароль комнаты: от 10 до 64 символов, только буквы, цифры и дефисы.'
    );
  end if;
  v_digest := encode(extensions.digest(v_code, 'sha256'), 'hex');

  select id into v_room_id
  from public.loveloom_rooms
  where code_digest = v_digest
  for update;

  if v_room_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Не удалось войти. Проверьте пароль комнаты.'
    );
  end if;

  select count(*)::integer into v_count
  from public.loveloom_room_members
  where room_id = v_room_id;
  if v_count >= 2 then
    return jsonb_build_object(
      'ok', false,
      'error', 'У нас все дома — в комнате уже двое.'
    );
  end if;

  insert into public.loveloom_room_members(room_id, user_id, role)
  values (v_room_id, v_uid, 'member');
  delete from private.loveloom_join_attempts where user_id = v_uid;
  return jsonb_build_object('ok', true, 'roomId', v_room_id);
end;
$$;

create or replace function public.loveloom_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  update public.loveloom_room_members
    set last_seen_at = now()
  where user_id = v_uid;
end;
$$;

create or replace function public.loveloom_update_room_settings(
  p_epoch integer,
  p_start text,
  p_timezone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_start date;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if not exists (
    select 1 from public.loveloom_rooms
    where id = v_room_id and creator_id = v_uid
  ) then
    raise exception 'Эти настройки меняет создатель комнаты.';
  end if;

  if coalesce(p_start, '') <> '' then
    if p_start !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Некорректная дата.'; end if;
    v_start := p_start::date;
    if v_start > current_date then raise exception 'Дата начала не может быть в будущем.'; end if;
  end if;
  if p_timezone not in (
    'Europe/Moscow', 'Europe/Istanbul', 'Asia/Yekaterinburg',
    'Asia/Almaty', 'Asia/Yerevan', 'UTC'
  ) then
    raise exception 'Выберите доступный часовой пояс.';
  end if;

  update public.loveloom_rooms
    set relationship_started_on = v_start, timezone = p_timezone
  where id = v_room_id;
end;
$$;

create or replace function public.loveloom_update_nickname(
  p_epoch integer,
  p_nickname text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_nickname text := btrim(coalesce(p_nickname, ''));
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if char_length(v_nickname) > 40 then raise exception 'Имя слишком длинное.'; end if;
  update public.loveloom_room_members
    set nickname = v_nickname
  where room_id = v_room_id and user_id = v_uid;
end;
$$;

create or replace function public.loveloom_leave_room(
  p_epoch integer,
  p_confirm text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_creator uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  select creator_id into v_creator
  from public.loveloom_rooms where id = v_room_id for update;
  if v_creator = v_uid then raise exception 'Создатель может только удалить комнату.'; end if;
  if p_confirm <> 'УДАЛИТЬ ИСТОРИЮ' then raise exception 'Подтвердите удаление истории.'; end if;

  delete from public.loveloom_messages where room_id = v_room_id;
  delete from public.loveloom_entries where room_id = v_room_id;
  delete from public.loveloom_locations where room_id = v_room_id;
  delete from public.loveloom_games where room_id = v_room_id;
  delete from public.loveloom_room_members
    where room_id = v_room_id and user_id = v_uid;
  update public.loveloom_room_members
    set nickname = ''
  where room_id = v_room_id;
  update public.loveloom_rooms
    set epoch = epoch + 1, relationship_started_on = null
  where id = v_room_id;
end;
$$;

create or replace function public.loveloom_delete_room(
  p_epoch integer,
  p_confirm text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if not exists (
    select 1 from public.loveloom_rooms
    where id = v_room_id and creator_id = v_uid
  ) then
    raise exception 'Удалить комнату может только создатель.';
  end if;
  if p_confirm <> 'УДАЛИТЬ КОМНАТУ' then raise exception 'Подтвердите удаление комнаты.'; end if;
  delete from public.loveloom_rooms where id = v_room_id;
end;
$$;

create or replace function public.loveloom_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_email text;
  v_room public.loveloom_rooms%rowtype;
  v_nickname text := '';
  v_code text := '';
  v_members jsonb := '[]'::jsonb;
  v_entries jsonb := '[]'::jsonb;
  v_distance integer;
  v_location_shared boolean := false;
  v_location_updated bigint;
  v_lats double precision[];
  v_lons double precision[];
  v_updates timestamptz[];
  v_h double precision;
begin
  if v_uid is null then
    return jsonb_build_object(
      'user', null, 'room', null, 'entries', '[]'::jsonb,
      'distance', null, 'locationShared', false,
      'locationUpdated', null, 'csrf', ''
    );
  end if;

  select p.display_name, u.email into v_name, v_email
  from public.loveloom_profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = v_uid;

  select r.* into v_room
  from public.loveloom_rooms r
  join public.loveloom_room_members m on m.room_id = r.id
  where m.user_id = v_uid;

  if v_room.id is not null then
    select m.nickname into v_nickname
    from public.loveloom_room_members m
    where m.room_id = v_room.id and m.user_id = v_uid;
  end if;

  if v_room.id is not null then
    select coalesce(ds.decrypted_secret, '') into v_code
    from vault.decrypted_secrets ds
    where ds.id = v_room.code_secret_id;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', q.user_id,
        'name', q.display_name,
        'seen', floor(extract(epoch from q.last_seen_at) * 1000)::bigint
      ) order by q.sort_order, q.joined_at
    ), '[]'::jsonb)
    into v_members
    from (
      select m.user_id, p.display_name, m.last_seen_at, m.joined_at,
        case when m.role = 'creator' then 0 else 1 end as sort_order
      from public.loveloom_room_members m
      join public.loveloom_profiles p on p.user_id = m.user_id
      where m.room_id = v_room.id
    ) q;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'room', e.room_id,
        'author', e.author_id,
        'kind', e.kind,
        'title', e.title,
        'body', e.body,
        'date', coalesce(to_char(e.event_date, 'YYYY-MM-DD'), ''),
        'done', case when e.is_done then 1 else 0 end,
        'created', floor(extract(epoch from e.created_at) * 1000)::bigint,
        'version', e.version
      ) order by e.created_at desc
    ), '[]'::jsonb)
    into v_entries
    from public.loveloom_entries e
    where e.room_id = v_room.id;

    select
      coalesce(bool_or(l.user_id = v_uid), false),
      array_agg(l.latitude::double precision order by l.user_id),
      array_agg(l.longitude::double precision order by l.user_id),
      array_agg(l.updated_at order by l.user_id)
    into v_location_shared, v_lats, v_lons, v_updates
    from public.loveloom_locations l
    where l.room_id = v_room.id;

    if cardinality(v_lats) = 2 then
      v_h := sin(radians(v_lats[2] - v_lats[1]) / 2) ^ 2
        + cos(radians(v_lats[1])) * cos(radians(v_lats[2]))
        * sin(radians(v_lons[2] - v_lons[1]) / 2) ^ 2;
      v_distance := round(6371 * 2 * asin(least(1, sqrt(v_h))))::integer;
      v_location_updated := floor(
        extract(epoch from least(v_updates[1], v_updates[2])) * 1000
      )::bigint;
    end if;
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object('id', v_uid, 'name', v_name, 'email', v_email),
    'room', case when v_room.id is null then null else jsonb_build_object(
      'id', v_room.id,
      'owner', v_room.creator_id,
      'code', v_code,
      'start', coalesce(to_char(v_room.relationship_started_on, 'YYYY-MM-DD'), ''),
      'timezone', v_room.timezone,
      'created', floor(extract(epoch from v_room.created_at) * 1000)::bigint,
      'epoch', v_room.epoch,
      'billing', 'free',
      'members', v_members,
      'nickname', v_nickname
    ) end,
    'entries', v_entries,
    'distance', v_distance,
    'locationShared', v_location_shared,
    'locationUpdated', v_location_updated,
    'csrf', ''
  );
end;
$$;

create or replace function public.loveloom_get_messages(p_before bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_epoch integer;
  v_messages jsonb;
  v_has_more boolean;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, null);
  select epoch into v_epoch from public.loveloom_rooms where id = v_room_id;

  with page as (
    select m.*
    from public.loveloom_messages m
    where m.room_id = v_room_id
      and (p_before is null or m.seq < p_before)
    order by m.seq desc
    limit 41
  ), visible as (
    select * from page order by seq desc limit 40
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'seq', v.seq,
        'id', v.id,
        'author', v.author_id,
        'text', v.body,
        'created', floor(extract(epoch from v.created_at) * 1000)::bigint
      ) order by v.seq asc
    ), '[]'::jsonb),
    (select count(*) > 40 from page)
  into v_messages, v_has_more
  from visible v;

  return jsonb_build_object(
    'messages', v_messages,
    'hasMore', coalesce(v_has_more, false),
    'epoch', v_epoch
  );
end;
$$;

create or replace function public.loveloom_add_message(
  p_epoch integer,
  p_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_text text := btrim(coalesce(p_text, ''));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if char_length(v_text) not between 1 and 4000 then
    raise exception 'Сообщение должно содержать от 1 до 4000 символов.';
  end if;

  insert into public.loveloom_messages(room_id, author_id, body)
  values (v_room_id, v_uid, v_text)
  returning id into v_id;

  delete from public.loveloom_messages old
  where old.room_id = v_room_id
    and old.seq in (
      select m.seq
      from public.loveloom_messages m
      where m.room_id = v_room_id
      order by m.seq desc
      offset 1000
    );
  return v_id;
end;
$$;

create or replace function public.loveloom_save_entry(
  p_id uuid,
  p_version integer,
  p_kind text,
  p_title text,
  p_body text,
  p_date text,
  p_done boolean,
  p_epoch integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := coalesce(p_body, '');
  v_date date;
  v_id uuid;
  v_count integer;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if p_kind not in ('event', 'memory', 'note', 'wish', 'movie', 'music') then
    raise exception 'Неизвестный раздел.';
  end if;
  if char_length(v_title) not between 1 and 140 then raise exception 'Добавьте название.'; end if;
  if char_length(v_body) > 4000 then raise exception 'Текст слишком длинный.'; end if;
  if coalesce(p_date, '') <> '' then
    if p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Некорректная дата.'; end if;
    v_date := p_date::date;
  end if;
  if p_kind = 'event' and v_date is null then raise exception 'Для события нужна дата.'; end if;

  if p_id is null then
    select count(*)::integer into v_count
    from public.loveloom_entries where room_id = v_room_id;
    if v_count >= 2000 then raise exception 'Достигнут лимит записей beta-версии.'; end if;
    insert into public.loveloom_entries(
      room_id, author_id, kind, title, body, event_date, is_done
    ) values (
      v_room_id, v_uid, p_kind, v_title, v_body, v_date, coalesce(p_done, false)
    ) returning id into v_id;
  else
    update public.loveloom_entries
      set title = v_title,
          body = v_body,
          event_date = v_date,
          is_done = coalesce(p_done, false),
          version = version + 1,
          updated_at = now()
    where id = p_id and room_id = v_room_id and version = p_version
    returning id into v_id;
    if v_id is null then
      if exists (
        select 1 from public.loveloom_entries
        where id = p_id and room_id = v_room_id
      ) then
        raise exception 'Партнёр уже изменил эту запись. Обновите её.';
      end if;
      raise exception 'Запись не найдена.';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.loveloom_delete_entry(
  p_id uuid,
  p_epoch integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  delete from public.loveloom_entries where id = p_id and room_id = v_room_id;
end;
$$;

create or replace function public.loveloom_update_location(
  p_epoch integer,
  p_clear boolean,
  p_consent boolean,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if coalesce(p_clear, false) then
    delete from public.loveloom_locations
    where room_id = v_room_id and user_id = v_uid;
    return;
  end if;
  if not coalesce(p_consent, false)
    or p_latitude is null or p_longitude is null
    or not (p_latitude between -90 and 90)
    or not (p_longitude between -180 and 180) then
    raise exception 'Нет согласия или координаты некорректны.';
  end if;
  insert into public.loveloom_locations(
    room_id, user_id, latitude, longitude, updated_at
  ) values (
    v_room_id,
    v_uid,
    round(p_latitude::numeric, 1),
    round(p_longitude::numeric, 1),
    now()
  )
  on conflict (room_id, user_id) do update
    set latitude = excluded.latitude,
        longitude = excluded.longitude,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.loveloom_get_game()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_game public.loveloom_games%rowtype;
  v_complete boolean;
  v_responses jsonb;
  v_correct text;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, null);
  select * into v_game
  from public.loveloom_games
  where room_id = v_room_id
  order by created_at desc
  limit 1;
  if v_game.id is null then return null; end if;

  select count(*) = 2 into v_complete
  from public.loveloom_game_answers where game_id = v_game.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user', a.user_id,
      'answer', case when v_complete or a.user_id = v_uid then a.answer ->> 'answer' else null end,
      'guess', case when v_complete or a.user_id = v_uid then a.answer ->> 'guess' else null end
    ) order by a.created_at
  ), '[]'::jsonb)
  into v_responses
  from public.loveloom_game_answers a
  where a.game_id = v_game.id;

  if v_complete and v_game.kind = 'quiz' then
    v_correct := case v_game.question
      when 'Какой океан самый большой?' then 'Тихий'
      when 'Какая планета ближе всего к Солнцу?' then 'Меркурий'
      else null
    end;
  end if;

  return jsonb_build_object(
    'id', v_game.id,
    'kind', v_game.kind,
    'question', v_game.question,
    'choices', v_game.choices,
    'responses', v_responses,
    'complete', v_complete,
    'correctAnswer', v_correct
  );
end;
$$;

create or replace function public.loveloom_start_game(
  p_epoch integer,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_game_id uuid;
  v_question text;
  v_choices jsonb;
  v_latest uuid;
  v_answer_count integer;
  v_member_count integer;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  select count(*)::integer into v_member_count
  from public.loveloom_room_members where room_id = v_room_id;
  if v_member_count <> 2 then raise exception 'Пригласите второго участника, чтобы играть вместе.'; end if;

  select id into v_latest from public.loveloom_games
  where room_id = v_room_id order by created_at desc limit 1;
  if v_latest is not null then
    select count(*)::integer into v_answer_count
    from public.loveloom_game_answers where game_id = v_latest;
    if v_answer_count < 2 then raise exception 'Сначала завершите текущий раунд.'; end if;
  end if;

  case p_kind
    when 'know' then
      v_question := 'Какой выходной выберете вы? А ваш партнёр?';
      v_choices := '["Прогулка на природе","Домашний киномарафон","Поездка в новый город","Встреча с друзьями"]'::jsonb;
    when 'quiz' then
      if random() < 0.5 then
        v_question := 'Какой океан самый большой?';
        v_choices := '["Тихий","Атлантический","Индийский","Северный Ледовитый"]'::jsonb;
      else
        v_question := 'Какая планета ближе всего к Солнцу?';
        v_choices := '["Венера","Меркурий","Марс","Земля"]'::jsonb;
      end if;
    when 'either' then
      if random() < 0.5 then
        v_question := 'Куда отправимся?';
        v_choices := '["К морю","В горы"]'::jsonb;
      else
        v_question := 'Что выберем вечером?';
        v_choices := '["Фильм","Настольную игру"]'::jsonb;
      end if;
    when 'date' then
      if random() < 0.5 then
        v_question := 'План на двоих: приготовьте вместе новое блюдо и придумайте ему название.';
      else
        v_question := 'План на двоих: выберите незнакомую улицу и устройте фотопрогулку.';
      end if;
      v_choices := '["Договорились","Давайте в другой день"]'::jsonb;
    else
      raise exception 'Неизвестная игра.';
  end case;

  insert into public.loveloom_games(room_id, kind, question, choices)
  values (v_room_id, p_kind, v_question, v_choices)
  returning id into v_game_id;
  return v_game_id;
end;
$$;

create or replace function public.loveloom_answer_game(
  p_epoch integer,
  p_id uuid,
  p_answer text,
  p_guess text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_game public.loveloom_games%rowtype;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  select * into v_game from public.loveloom_games
  where id = p_id and room_id = v_room_id;
  if v_game.id is null or not exists (
    select 1 from jsonb_array_elements_text(v_game.choices) c(value)
    where c.value = p_answer
  ) then
    raise exception 'Этот раунд уже недоступен.';
  end if;
  if v_game.kind = 'know' and not exists (
    select 1 from jsonb_array_elements_text(v_game.choices) c(value)
    where c.value = p_guess
  ) then
    raise exception 'Выберите предполагаемый ответ партнёра.';
  end if;
  if exists (
    select 1 from public.loveloom_game_answers
    where game_id = p_id and user_id = v_uid
  ) then
    raise exception 'Ответ уже принят. Ждём партнёра.';
  end if;
  insert into public.loveloom_game_answers(game_id, user_id, answer)
  values (
    p_id,
    v_uid,
    jsonb_build_object(
      'answer', p_answer,
      'guess', case when v_game.kind = 'know' then p_guess else null end
    )
  );
end;
$$;

revoke all on function public.loveloom_create_room(text, text, text) from public, anon;
revoke all on function public.loveloom_join_room(text) from public, anon;
revoke all on function public.loveloom_presence() from public, anon;
revoke all on function public.loveloom_update_room_settings(integer, text, text) from public, anon;
revoke all on function public.loveloom_update_nickname(integer, text) from public, anon;
revoke all on function public.loveloom_leave_room(integer, text) from public, anon;
revoke all on function public.loveloom_delete_room(integer, text) from public, anon;
revoke all on function public.loveloom_state() from public, anon;
revoke all on function public.loveloom_get_messages(bigint) from public, anon;
revoke all on function public.loveloom_add_message(integer, text) from public, anon;
revoke all on function public.loveloom_save_entry(uuid, integer, text, text, text, text, boolean, integer) from public, anon;
revoke all on function public.loveloom_delete_entry(uuid, integer) from public, anon;
revoke all on function public.loveloom_update_location(integer, boolean, boolean, double precision, double precision) from public, anon;
revoke all on function public.loveloom_get_game() from public, anon;
revoke all on function public.loveloom_start_game(integer, text) from public, anon;
revoke all on function public.loveloom_answer_game(integer, uuid, text, text) from public, anon;

grant execute on function public.loveloom_create_room(text, text, text) to authenticated;
grant execute on function public.loveloom_join_room(text) to authenticated;
grant execute on function public.loveloom_presence() to authenticated;
grant execute on function public.loveloom_update_room_settings(integer, text, text) to authenticated;
grant execute on function public.loveloom_update_nickname(integer, text) to authenticated;
grant execute on function public.loveloom_leave_room(integer, text) to authenticated;
grant execute on function public.loveloom_delete_room(integer, text) to authenticated;
grant execute on function public.loveloom_state() to authenticated;
grant execute on function public.loveloom_get_messages(bigint) to authenticated;
grant execute on function public.loveloom_add_message(integer, text) to authenticated;
grant execute on function public.loveloom_save_entry(uuid, integer, text, text, text, text, boolean, integer) to authenticated;
grant execute on function public.loveloom_delete_entry(uuid, integer) to authenticated;
grant execute on function public.loveloom_update_location(integer, boolean, boolean, double precision, double precision) to authenticated;
grant execute on function public.loveloom_get_game() to authenticated;
grant execute on function public.loveloom_start_game(integer, text) to authenticated;
grant execute on function public.loveloom_answer_game(integer, uuid, text, text) to authenticated;

comment on table public.loveloom_rooms is
  'LoveLoom pair rooms. Invitation codes are hashed for lookup and encrypted in Supabase Vault.';
comment on table public.loveloom_messages is
  'Immutable room chat; the database keeps the newest 1000 messages per room.';
