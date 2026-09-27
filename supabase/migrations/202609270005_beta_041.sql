-- LoveLoom beta 0.4.1: broader mobile photo support, three-capsule
-- retention and long-term shared-garden milestones.

update storage.buckets
set
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'audio/x-m4a', 'audio/aac'
  ]::text[]
where id = 'loveloom-media';

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
  if p_kind = 'audio' and p_bytes > 26214400 then
    raise exception 'Аудио не должно превышать 25 МБ.';
  end if;
  if not (
    (p_kind = 'image' and p_mime in (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
      'image/heic', 'image/heif'
    ))
    or (p_kind = 'video' and p_mime in ('video/mp4', 'video/webm', 'video/quicktime'))
    or (p_kind = 'audio' and p_mime in (
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
      'audio/x-m4a', 'audio/aac'
    ))
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

-- Keep only the three newest capsules in every existing room.
with ranked as (
  select
    id,
    row_number() over (
      partition by room_id
      order by created_at desc, id desc
    ) as position
  from public.loveloom_capsules
)
delete from public.loveloom_capsules capsule
using ranked
where capsule.id = ranked.id
  and ranked.position > 3;

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
    ) order by c.created_at desc, c.id desc
  ), '[]'::jsonb)
  into v_capsules
  from (
    select *
    from public.loveloom_capsules
    where room_id = v_room_id
    order by created_at desc, id desc
    limit 3
  ) c;

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

  insert into public.loveloom_capsules(room_id, author_id, title, body, opens_at)
  values (v_room_id, v_uid, v_title, v_body, p_opens_at)
  returning id into v_id;

  delete from public.loveloom_capsules old
  where old.room_id = v_room_id
    and old.id in (
      select c.id
      from public.loveloom_capsules c
      where c.room_id = v_room_id
      order by c.created_at desc, c.id desc
      offset 3
    );

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
  v_stage integer;
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
  v_stage := case
    when v_growth >= 100 then 3
    when v_growth >= 50 then 2
    when v_growth >= 30 then 1
    else 0
  end;
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
    'stage', v_stage,
    'wateredToday', v_watered,
    'lastWateredBy', v_last_user,
    'lastWateredAt', case when v_last_at is null then null else
      floor(extract(epoch from v_last_at) * 1000)::bigint end
  );
end;
$$;

revoke all on function public.loveloom_register_media(uuid, integer, text, text, text, text, bigint, text) from public, anon;
revoke all on function public.loveloom_list_capsules() from public, anon;
revoke all on function public.loveloom_create_capsule(integer, text, text, timestamptz) from public, anon;
revoke all on function public.loveloom_garden_state() from public, anon;

grant execute on function public.loveloom_register_media(uuid, integer, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.loveloom_list_capsules() to authenticated;
grant execute on function public.loveloom_create_capsule(integer, text, text, timestamptz) to authenticated;
grant execute on function public.loveloom_garden_state() to authenticated;

comment on table public.loveloom_capsules is
  'Immutable time capsules. Only the three newest capsules are retained per room; bodies remain concealed until opens_at.';
