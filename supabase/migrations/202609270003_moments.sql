-- LoveLoom moments: private media, time capsules, shared garden and
-- room-scoped Realtime authorization for the ephemeral tactile feature.

create table public.loveloom_media (
  id uuid primary key,
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  kind text not null,
  context text not null,
  mime_type text not null,
  byte_size bigint not null,
  caption text not null default '',
  created_at timestamptz not null default now(),
  constraint loveloom_media_kind check (kind in ('image', 'video', 'audio')),
  constraint loveloom_media_context check (context in ('chat', 'album')),
  constraint loveloom_media_album_images_only
    check (context <> 'album' or kind = 'image'),
  constraint loveloom_media_path_length
    check (char_length(storage_path) between 10 and 240),
  constraint loveloom_media_mime_length
    check (char_length(mime_type) between 3 and 100),
  constraint loveloom_media_size
    check (byte_size between 1 and 104857600),
  constraint loveloom_media_caption_length
    check (char_length(caption) <= 500)
);

create index loveloom_media_room_context_created_idx
  on public.loveloom_media(room_id, context, created_at desc);
create index loveloom_media_author_idx
  on public.loveloom_media(author_id);

alter table public.loveloom_messages
  add column media_id uuid references public.loveloom_media(id) on delete cascade;
alter table public.loveloom_messages
  alter column body set default '';
alter table public.loveloom_messages
  drop constraint loveloom_messages_body_length;
alter table public.loveloom_messages
  add constraint loveloom_messages_content check (
    (media_id is null and char_length(btrim(body)) between 1 and 4000)
    or (media_id is not null and char_length(body) <= 4000)
  );
create unique index loveloom_messages_one_media_idx
  on public.loveloom_messages(media_id)
  where media_id is not null;

create table public.loveloom_capsules (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  opens_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint loveloom_capsules_title_length
    check (char_length(btrim(title)) between 1 and 100),
  constraint loveloom_capsules_body_length
    check (char_length(btrim(body)) between 1 and 8000)
);
create index loveloom_capsules_room_open_idx
  on public.loveloom_capsules(room_id, opens_at, created_at desc);

create table public.loveloom_garden_actions (
  room_id uuid not null references public.loveloom_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_date date not null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, action_date)
);
create index loveloom_garden_actions_room_created_idx
  on public.loveloom_garden_actions(room_id, created_at desc);

alter table public.loveloom_media enable row level security;
alter table public.loveloom_capsules enable row level security;
alter table public.loveloom_garden_actions enable row level security;

create policy loveloom_media_select_member
on public.loveloom_media for select to authenticated
using (private.loveloom_is_room_member(room_id));

create policy loveloom_capsules_select_member
on public.loveloom_capsules for select to authenticated
using (private.loveloom_is_room_member(room_id));

create policy loveloom_garden_select_member
on public.loveloom_garden_actions for select to authenticated
using (private.loveloom_is_room_member(room_id));

revoke all on table public.loveloom_media from anon, authenticated;
revoke all on table public.loveloom_capsules from anon, authenticated;
revoke all on table public.loveloom_garden_actions from anon, authenticated;

create or replace function private.loveloom_can_access_media_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loveloom_room_members m
    where m.user_id = (select auth.uid())
      and m.room_id::text = coalesce((storage.foldername(p_name))[1], '')
  );
$$;

create or replace function private.loveloom_is_touch_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loveloom_room_members m
    where m.user_id = (select auth.uid())
      and p_topic = 'loveloom:touch:' || m.room_id::text
  );
$$;

revoke all on function private.loveloom_can_access_media_path(text) from public;
revoke all on function private.loveloom_is_touch_topic(text) from public;
grant execute on function private.loveloom_can_access_media_path(text) to authenticated;
grant execute on function private.loveloom_is_touch_topic(text) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'loveloom-media',
  'loveloom-media',
  false,
  104857600,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'audio/x-m4a', 'audio/aac'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists loveloom_media_objects_select on storage.objects;
create policy loveloom_media_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'loveloom-media'
  and private.loveloom_can_access_media_path(name)
);

drop policy if exists loveloom_media_objects_insert on storage.objects;
create policy loveloom_media_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'loveloom-media'
  and owner_id = (select auth.uid())::text
  and private.loveloom_can_access_media_path(name)
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{2,8}$'
);

-- Deletion is only used to roll back an upload that failed before metadata was
-- registered. There is deliberately no album delete action in the client.
drop policy if exists loveloom_media_objects_delete_own on storage.objects;
create policy loveloom_media_objects_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'loveloom-media'
  and owner_id = (select auth.uid())::text
  and private.loveloom_can_access_media_path(name)
);

drop policy if exists loveloom_touch_read on realtime.messages;
create policy loveloom_touch_read
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.loveloom_is_touch_topic((select realtime.topic()))
);

drop policy if exists loveloom_touch_write on realtime.messages;
create policy loveloom_touch_write
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.loveloom_is_touch_topic((select realtime.topic()))
);

create or replace function public.loveloom_list_media(p_context text default 'album')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_media jsonb;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, null);
  if p_context not in ('album', 'chat', 'all') then
    raise exception 'Неизвестный раздел медиа.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'room', m.room_id,
      'author', m.author_id,
      'kind', m.kind,
      'context', m.context,
      'mime', m.mime_type,
      'bytes', m.byte_size,
      'caption', m.caption,
      'path', m.storage_path,
      'created', floor(extract(epoch from m.created_at) * 1000)::bigint
    ) order by m.created_at desc
  ), '[]'::jsonb)
  into v_media
  from public.loveloom_media m
  where m.room_id = v_room_id
    and (p_context = 'all' or m.context = p_context);

  return v_media;
end;
$$;

create or replace function public.loveloom_register_media(
  p_id uuid,
  p_epoch integer,
  p_path text,
  p_kind text,
  p_context text,
  p_mime text,
  p_bytes bigint,
  p_caption text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_caption text := btrim(coalesce(p_caption, ''));
  v_object_size bigint;
  v_object_mime text;
  v_message_id uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if p_id is null then raise exception 'Некорректный файл.'; end if;
  if p_context not in ('chat', 'album') then raise exception 'Неизвестный раздел медиа.'; end if;
  if p_kind not in ('image', 'video', 'audio') then raise exception 'Неподдерживаемый тип файла.'; end if;
  if p_context = 'album' and p_kind <> 'image' then
    raise exception 'В фотоальбом можно добавлять только изображения.';
  end if;
  if char_length(v_caption) > 500 then raise exception 'Подпись слишком длинная.'; end if;
  if p_bytes not between 1 and 104857600 then raise exception 'Файл слишком большой.'; end if;
  if p_kind in ('image', 'audio') and p_bytes > 26214400 then
    raise exception 'Изображение или аудио не должно превышать 25 МБ.';
  end if;
  if not (
    (p_kind = 'image' and p_mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'))
    or (p_kind = 'video' and p_mime in ('video/mp4', 'video/webm', 'video/quicktime'))
    or (p_kind = 'audio' and p_mime in ('audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/aac'))
  ) then
    raise exception 'Этот формат файла не поддерживается.';
  end if;
  if p_path !~ ('^' || v_room_id::text || '/' || p_id::text || '\.[a-z0-9]{2,8}$') then
    raise exception 'Некорректный путь файла.';
  end if;

  select
    nullif(o.metadata ->> 'size', '')::bigint,
    o.metadata ->> 'mimetype'
  into v_object_size, v_object_mime
  from storage.objects o
  where o.bucket_id = 'loveloom-media'
    and o.name = p_path
    and o.owner_id = v_uid::text;

  if v_object_size is null then raise exception 'Загруженный файл не найден.'; end if;
  if v_object_size <> p_bytes or coalesce(v_object_mime, '') <> p_mime then
    raise exception 'Параметры загруженного файла не совпадают.';
  end if;
  if (select count(*) from public.loveloom_media where room_id = v_room_id) >= 5000 then
    raise exception 'В комнате достигнут лимит медиафайлов beta-версии.';
  end if;

  insert into public.loveloom_media(
    id, room_id, author_id, storage_path, kind, context,
    mime_type, byte_size, caption
  ) values (
    p_id, v_room_id, v_uid, p_path, p_kind, p_context,
    p_mime, p_bytes, v_caption
  );

  if p_context = 'chat' then
    insert into public.loveloom_messages(room_id, author_id, body, media_id)
    values (v_room_id, v_uid, v_caption, p_id)
    returning id into v_message_id;

    delete from public.loveloom_messages old
    where old.room_id = v_room_id
      and old.seq in (
        select m.seq
        from public.loveloom_messages m
        where m.room_id = v_room_id
        order by m.seq desc
        offset 1000
      );
  end if;

  return coalesce(v_message_id, p_id);
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
        'created', floor(extract(epoch from v.created_at) * 1000)::bigint,
        'media', case when md.id is null then null else jsonb_build_object(
          'id', md.id,
          'room', md.room_id,
          'author', md.author_id,
          'kind', md.kind,
          'context', md.context,
          'mime', md.mime_type,
          'bytes', md.byte_size,
          'caption', md.caption,
          'path', md.storage_path,
          'created', floor(extract(epoch from md.created_at) * 1000)::bigint
        ) end
      ) order by v.seq asc
    ), '[]'::jsonb),
    (select count(*) > 40 from page)
  into v_messages, v_has_more
  from visible v
  left join public.loveloom_media md on md.id = v.media_id;

  return jsonb_build_object(
    'messages', v_messages,
    'hasMore', coalesce(v_has_more, false),
    'epoch', v_epoch
  );
end;
$$;

create or replace function public.loveloom_list_capsules()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_capsules jsonb;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, null);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'author', c.author_id,
      'title', c.title,
      'body', case when c.opens_at <= now() then c.body else null end,
      'opensAt', floor(extract(epoch from c.opens_at) * 1000)::bigint,
      'created', floor(extract(epoch from c.created_at) * 1000)::bigint,
      'isOpen', c.opens_at <= now()
    ) order by c.opens_at asc, c.created_at desc
  ), '[]'::jsonb)
  into v_capsules
  from public.loveloom_capsules c
  where c.room_id = v_room_id;

  return v_capsules;
end;
$$;

create or replace function public.loveloom_create_capsule(
  p_epoch integer,
  p_title text,
  p_body text,
  p_opens_at timestamptz
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
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if char_length(v_title) not between 1 and 100 then raise exception 'Добавьте короткое название.'; end if;
  if char_length(v_body) not between 1 and 8000 then raise exception 'Добавьте текст капсулы.'; end if;
  if p_opens_at < now() + interval '1 minute' then
    raise exception 'Выберите время открытия в будущем.';
  end if;
  if p_opens_at > now() + interval '5 years' then
    raise exception 'Капсулу можно закрыть максимум на пять лет.';
  end if;
  if (select count(*) from public.loveloom_capsules where room_id = v_room_id) >= 200 then
    raise exception 'В комнате уже максимальное количество капсул.';
  end if;

  insert into public.loveloom_capsules(room_id, author_id, title, body, opens_at)
  values (v_room_id, v_uid, v_title, v_body, p_opens_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.loveloom_garden_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_timezone text;
  v_today date;
  v_growth integer;
  v_watered boolean;
  v_last_user uuid;
  v_last_at timestamptz;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, null);
  select timezone into v_timezone from public.loveloom_rooms where id = v_room_id;
  v_today := (now() at time zone v_timezone)::date;

  select count(*)::integer into v_growth
  from public.loveloom_garden_actions where room_id = v_room_id;
  select exists (
    select 1 from public.loveloom_garden_actions
    where room_id = v_room_id and user_id = v_uid and action_date = v_today
  ) into v_watered;
  select user_id, created_at into v_last_user, v_last_at
  from public.loveloom_garden_actions
  where room_id = v_room_id
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'growth', v_growth,
    'stage', least(5, floor(v_growth / 3.0)::integer),
    'wateredToday', v_watered,
    'lastWateredBy', v_last_user,
    'lastWateredAt', case when v_last_at is null then null else
      floor(extract(epoch from v_last_at) * 1000)::bigint end
  );
end;
$$;

create or replace function public.loveloom_water_garden(p_epoch integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_timezone text;
  v_today date;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  select timezone into v_timezone from public.loveloom_rooms where id = v_room_id;
  v_today := (now() at time zone v_timezone)::date;
  begin
    insert into public.loveloom_garden_actions(room_id, user_id, action_date)
    values (v_room_id, v_uid, v_today);
  exception when unique_violation then
    raise exception 'Сегодня вы уже позаботились о саде.';
  end;
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
  delete from public.loveloom_media where room_id = v_room_id;
  delete from public.loveloom_capsules where room_id = v_room_id;
  delete from public.loveloom_garden_actions where room_id = v_room_id;
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

revoke all on function public.loveloom_list_media(text) from public, anon;
revoke all on function public.loveloom_register_media(uuid, integer, text, text, text, text, bigint, text) from public, anon;
revoke all on function public.loveloom_list_capsules() from public, anon;
revoke all on function public.loveloom_create_capsule(integer, text, text, timestamptz) from public, anon;
revoke all on function public.loveloom_garden_state() from public, anon;
revoke all on function public.loveloom_water_garden(integer) from public, anon;

grant execute on function public.loveloom_list_media(text) to authenticated;
grant execute on function public.loveloom_register_media(uuid, integer, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.loveloom_list_capsules() to authenticated;
grant execute on function public.loveloom_create_capsule(integer, text, text, timestamptz) to authenticated;
grant execute on function public.loveloom_garden_state() to authenticated;
grant execute on function public.loveloom_water_garden(integer) to authenticated;

comment on table public.loveloom_media is
  'Private room media metadata. Binary objects live in the private loveloom-media Storage bucket.';
comment on table public.loveloom_capsules is
  'Immutable time capsules. RPC responses conceal the body until opens_at.';
comment on table public.loveloom_garden_actions is
  'At most one shared-garden action per room member and room-local calendar day.';
