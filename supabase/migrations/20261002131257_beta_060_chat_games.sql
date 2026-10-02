-- LoveLoom beta 0.6: richer pair games, threaded chat reactions and
-- room-scoped realtime synchronization hints.

alter table public.loveloom_messages
  add column reply_to uuid
  references public.loveloom_messages(id) on delete set null;

create index loveloom_messages_reply_idx
  on public.loveloom_messages(reply_to)
  where reply_to is not null;

create table public.loveloom_message_reactions (
  message_id uuid not null
    references public.loveloom_messages(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint loveloom_message_reactions_emoji
    check (emoji in ('💗', '😘', '😂', '🥹', '🤗', '👍'))
);

create index loveloom_message_reactions_user_idx
  on public.loveloom_message_reactions(user_id);

alter table public.loveloom_message_reactions enable row level security;
revoke all on table public.loveloom_message_reactions
  from public, anon, authenticated;

create table public.loveloom_game_questions (
  id bigint generated always as identity primary key,
  kind text not null,
  position smallint not null,
  question text not null,
  choices jsonb not null,
  correct_answer text,
  constraint loveloom_game_questions_kind
    check (kind in ('know', 'quiz', 'either', 'date')),
  constraint loveloom_game_questions_position
    check (position between 1 and 20),
  constraint loveloom_game_questions_question
    check (char_length(question) between 1 and 500),
  constraint loveloom_game_questions_choices
    check (
      jsonb_typeof(choices) = 'array'
      and jsonb_array_length(choices) between 2 and 4
    ),
  constraint loveloom_game_questions_unique unique (kind, position)
);

alter table public.loveloom_game_questions enable row level security;
revoke all on table public.loveloom_game_questions
  from public, anon, authenticated;
revoke all on sequence public.loveloom_game_questions_id_seq
  from public, anon, authenticated;

with source as (
  select convert_from(decode('W3sia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6MSwicXVlc3Rpb24iOiLQmtCw0LrQvtC5INCy0YvRhdC+0LTQvdC+0Lkg0LLRiyDQsdGLINCy0YvQsdGA0LDQu9C4PyDQkCDQstCw0Ygg0L/QsNGA0YLQvdGR0YA/IiwiY2hvaWNlcyI6WyLQn9GA0L7Qs9GD0LvQutCwINC90LAg0L/RgNC40YDQvtC00LUiLCLQlNC+0LzQsNGI0L3QuNC5INC60LjQvdC+0LzQsNGA0LDRhNC+0L0iLCLQn9C+0LXQt9C00LrQsCDQsiDQvdC+0LLRi9C5INCz0L7RgNC+0LQiLCLQktGB0YLRgNC10YfQsCDRgSDQtNGA0YPQt9GM0Y/QvNC4Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJrbm93IiwicG9zaXRpb24iOjIsInF1ZXN0aW9uIjoi0KfRgtC+INCx0YvRgdGC0YDQtdC1INCy0YHQtdCz0L4g0L/QvtC00L3QuNC80LDQtdGCINCy0LDQvCDQvdCw0YHRgtGA0L7QtdC90LjQtT8iLCJjaG9pY2VzIjpbItCe0LHRitGP0YLQuNGPIiwi0JvRjtCx0LjQvNCw0Y8g0LzRg9C30YvQutCwIiwi0JLQutGD0YHQvdCw0Y8g0LXQtNCwIiwi0JTQvtCx0YDQsNGPINGI0YPRgtC60LAiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6MywicXVlc3Rpb24iOiLQmtCw0LrQvtC5INC80LDQu9C10L3RjNC60LjQuSDRgdGO0YDQv9GA0LjQtyDQv9C+0YDQsNC00YPQtdGCINGB0LjQu9GM0L3QtdC1PyIsImNob2ljZXMiOlsi0JfQsNC/0LjRgdC60LAiLCLQptCy0LXRgtGLIiwi0JvRjtCx0LjQvNCw0Y8g0YHQu9Cw0LTQvtGB0YLRjCIsItCd0LXQvtC20LjQtNCw0L3QvdCw0Y8g0L/RgNC+0LPRg9C70LrQsCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoia25vdyIsInBvc2l0aW9uIjo0LCJxdWVzdGlvbiI6ItCT0LTQtSDQstCw0Lwg0LvQtdCz0YfQtSDQstGB0LXQs9C+INC/0L4t0L3QsNGB0YLQvtGP0YnQtdC80YMg0L7RgtC00L7RhdC90YPRgtGMPyIsImNob2ljZXMiOlsi0JTQvtC80LAiLCLQoyDQstC+0LTRiyIsItCSINC70LXRgdGDIiwi0JIg0L3QvtCy0L7QvCDQs9C+0YDQvtC00LUiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6NSwicXVlc3Rpb24iOiLQmtCw0LrQvtC5INGB0L7QstC80LXRgdGC0L3Ri9C5INCy0LXRh9C10YAg0LrQsNC20LXRgtGB0Y8g0LjQtNC10LDQu9GM0L3Ri9C8PyIsImNob2ljZXMiOlsi0KTQuNC70YzQvCDQuCDQv9C70LXQtCIsItCU0L7Qu9Cz0LDRjyDQv9GA0L7Qs9GD0LvQutCwIiwi0JjQs9GA0Ysg0Lgg0YHQvNC10YUiLCLQo9C20LjQvSDQstC90LUg0LTQvtC80LAiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6NiwicXVlc3Rpb24iOiLQmtCw0LrQvtC5INC30L3QsNC6INCy0L3QuNC80LDQvdC40Y8g0LTQu9GPINCy0LDRgSDQstCw0LbQvdC10LUg0LLRgdC10LPQvj8iLCJjaG9pY2VzIjpbItCi0ZHQv9C70YvQtSDRgdC70L7QstCwIiwi0JLRgNC10LzRjyDQstC80LXRgdGC0LUiLCLQn9C+0LzQvtGJ0Ywg0LIg0LTQtdC70LDRhSIsItCc0LDQu9C10L3RjNC60LjQuSDQv9C+0LTQsNGA0L7QuiJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoia25vdyIsInBvc2l0aW9uIjo3LCJxdWVzdGlvbiI6ItCn0YLQviDQstGLINGB0LrQvtGA0LXQtSDQstGL0LHQtdGA0LXRgtC1INCyINC90LXQt9C90LDQutC+0LzQvtC8INCz0L7RgNC+0LTQtT8iLCJjaG9pY2VzIjpbItCc0YPQt9C10LkiLCLQmtC+0YTQtdC50L3RjiIsItCf0LDRgNC6Iiwi0KHQvNC+0YLRgNC+0LLRg9GOINC/0LvQvtGJ0LDQtNC60YMiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6OCwicXVlc3Rpb24iOiLQmtCw0Log0LLRiyDQv9GA0LXQtNC/0L7Rh9C40YLQsNC10YLQtSDQvdCw0YfQuNC90LDRgtGMINGB0LLQvtCx0L7QtNC90L7QtSDRg9GC0YDQvj8iLCJjaG9pY2VzIjpbItCf0L7RgdC/0LDRgtGMINC/0L7QtNC+0LvRjNGI0LUiLCLQl9Cw0LLRgtGA0LDQuiDQsiDQutCw0YTQtSIsItCf0YDQvtCz0YPQu9C60LAiLCLQnNGD0LfRi9C60LAg0Lgg0LTQvtC80LDRiNC90LjQtSDQtNC10LvQsCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoia25vdyIsInBvc2l0aW9uIjo5LCJxdWVzdGlvbiI6ItCa0LDQutC+0Lkg0L/QvtC00LDRgNC+0Lot0LLQv9C10YfQsNGC0LvQtdC90LjQtSDQstCw0Lwg0LHQu9C40LbQtT8iLCJjaG9pY2VzIjpbItCa0L7QvdGG0LXRgNGCIiwi0J3QtdCx0L7Qu9GM0YjQvtC1INC/0YPRgtC10YjQtdGB0YLQstC40LUiLCLQnNCw0YHRgtC10YAt0LrQu9Cw0YHRgSIsItCj0Y7RgtC90YvQuSDQv9C40LrQvdC40LoiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6MTAsInF1ZXN0aW9uIjoi0KfRgtC+INCy0Ysg0YfQsNGJ0LUg0LfQsNC80LXRh9Cw0LXRgtC1INC/0LXRgNCy0YvQvD8iLCJjaG9pY2VzIjpbItCd0LDRgdGC0YDQvtC10L3QuNC1INGH0LXQu9C+0LLQtdC60LAiLCLQmtGA0LDRgdC40LLRi9C1INC00LXRgtCw0LvQuCIsItCd0L7QstGD0Y4g0LzRg9C30YvQutGDIiwi0JLQutGD0YHQvdGD0Y4g0LXQtNGDIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJrbm93IiwicG9zaXRpb24iOjExLCJxdWVzdGlvbiI6ItCa0LDQutC+0Lkg0YDQsNC30LPQvtCy0L7RgCDQstCw0Lwg0L7RgdC+0LHQtdC90L3QviDQvdGA0LDQstC40YLRgdGPPyIsImNob2ljZXMiOlsi0J4g0LzQtdGH0YLQsNGFIiwi0J4g0YHQvNC10YjQvdGL0YUg0YHQu9GD0YfQsNGP0YUiLCLQniDQsdGD0LTRg9GJ0LXQvCIsItCeINC70Y7QsdC40LzRi9GFINCy0L7RgdC/0L7QvNC40L3QsNC90LjRj9GFIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJrbm93IiwicG9zaXRpb24iOjEyLCJxdWVzdGlvbiI6ItCa0LDQutC+0Lkg0YHQv9C+0YHQvtCxINC/0L7QvNC40YDQuNGC0YzRgdGPINC60LDQttC10YLRgdGPINGB0LDQvNGL0Lwg0YLRkdC/0LvRi9C8PyIsImNob2ljZXMiOlsi0KHQv9C+0LrQvtC50L3QviDQv9C+0LPQvtCy0L7RgNC40YLRjCIsItCe0LHQvdGP0YLRjNGB0Y8iLCLQndCw0L/QuNGB0LDRgtGMINC/0LjRgdGM0LzQviIsItCh0LTQtdC70LDRgtGMINGH0LDQuSDQuCDQsdGL0YLRjCDRgNGP0LTQvtC8Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJrbm93IiwicG9zaXRpb24iOjEzLCJxdWVzdGlvbiI6ItCa0LDQutC+0Lkg0YHQtdC30L7QvSDQu9GD0YfRiNC1INCy0YHQtdCz0L4g0L/QvtC00YXQvtC00LjRgiDQstCw0YjQtdC5INC/0LDRgNC1PyIsImNob2ljZXMiOlsi0JLQtdGB0L3QsCIsItCb0LXRgtC+Iiwi0J7RgdC10L3RjCIsItCX0LjQvNCwIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJrbm93IiwicG9zaXRpb24iOjE0LCJxdWVzdGlvbiI6ItCn0YLQviDQstGLINCy0L7Qt9GM0LzRkdGC0LUg0L3QsCDQvdC10L7QsdC40YLQsNC10LzRi9C5INC+0YHRgtGA0L7QsiDQv9C10YDQstGL0Lw/IiwiY2hvaWNlcyI6WyLQn9C+0LvQtdC30L3Ri9C5INC90LDQsdC+0YAiLCLQmtC90LjQs9GDIiwi0JzRg9C30YvQutGDIiwi0JHQvtC70YzRiNC+0Lkg0LfQsNC/0LDRgSDQtdC00YsiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6MTUsInF1ZXN0aW9uIjoi0JrQsNC60YPRjiDQvtCx0YnRg9GOINC/0YDQuNCy0YvRh9C60YMg0LLQsNC8INGF0L7RgtC10LvQvtGB0Ywg0LHRiyDQt9Cw0LLQtdGB0YLQuD8iLCJjaG9pY2VzIjpbItCT0YPQu9GP0YLRjCDQutCw0LbQtNGL0Lkg0LTQtdC90YwiLCLQk9C+0YLQvtCy0LjRgtGMINCy0LzQtdGB0YLQtSIsItCn0LDRidC1INGE0L7RgtC+0LPRgNCw0YTQuNGA0L7QstCw0YLRjNGB0Y8iLCLQn9C70LDQvdC40YDQvtCy0LDRgtGMINGB0LLQuNC00LDQvdC40Y8iXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6MTYsInF1ZXN0aW9uIjoi0KfRgtC+INC00LvRjyDQstCw0YEg0LfQstGD0YfQuNGCINGA0L7QvNCw0L3RgtC40YfQvdC10LU/IiwiY2hvaWNlcyI6WyLQoNCw0YHRgdCy0LXRgiIsItCf0LjRgdGM0LzQviDQvtGCINGA0YPQutC4Iiwi0KLQsNC90LXRhiDQtNC+0LzQsCIsItCf0L7QtdC30LTQutCwINCx0LXQtyDQv9C70LDQvdCwIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJrbm93IiwicG9zaXRpb24iOjE3LCJxdWVzdGlvbiI6ItCa0LDQutC+0Lkg0L7RgtC00YvRhSDQstGLINCy0YvQsdC10YDQtdGC0LUg0L/QvtGB0LvQtSDRgdC70L7QttC90L7QuSDQvdC10LTQtdC70Lg/IiwiY2hvaWNlcyI6WyLQotC40YjQuNC90LAg0Lgg0YHQvtC9Iiwi0JDQutGC0LjQstC90LDRjyDQv9GA0L7Qs9GD0LvQutCwIiwi0JLRgdGC0YDQtdGH0LAg0YEg0LHQu9C40LfQutC40LzQuCIsItCb0Y7QsdC40LzRi9C5INGB0LXRgNC40LDQuyJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoia25vdyIsInBvc2l0aW9uIjoxOCwicXVlc3Rpb24iOiLQp9GC0L4g0LLRiyDRgdC60L7RgNC10LUg0YHQvtGF0YDQsNC90LjRgtC1INC90LAg0L/QsNC80Y/RgtGMPyIsImNob2ljZXMiOlsi0JHQuNC70LXRgiIsItCk0L7RgtC+0LPRgNCw0YTQuNGOIiwi0JfQsNC/0LjRgdC60YMiLCLQnNCw0LvQtdC90YzQutC40Lkg0YHRg9Cy0LXQvdC40YAiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6MTksInF1ZXN0aW9uIjoi0JrQsNC60L7QuSDQutC+0LzQv9C70LjQvNC10L3RgiDQstCw0Lwg0L/RgNC40Y/RgtC90LXQtSDRg9GB0LvRi9GI0LDRgtGMPyIsImNob2ljZXMiOlsi0J/RgNC+INGF0LDRgNCw0LrRgtC10YAiLCLQn9GA0L4g0LLQvdC10YjQvdC+0YHRgtGMIiwi0J/RgNC+INGC0LDQu9Cw0L3RgiIsItCf0YDQviDQt9Cw0LHQvtGC0YMiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6Imtub3ciLCJwb3NpdGlvbiI6MjAsInF1ZXN0aW9uIjoi0JrRg9C00LAg0LLRiyDQvtGC0L/RgNCw0LLQuNGC0LXRgdGMLCDQtdGB0LvQuCDQstC90LXQt9Cw0L/QvdC+INC+0YHQstC+0LHQvtC00LjRgtGB0Y8g0LTQtdC90Yw/IiwiY2hvaWNlcyI6WyLQl9CwINCz0L7RgNC+0LQiLCLQkiDRhtC10L3RgtGAINCz0L7RgNC+0LTQsCIsItCSINCz0L7RgdGC0LgiLCLQntGB0YLQsNC90YPRgdGMINC00L7QvNCwIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjEsInF1ZXN0aW9uIjoi0JrQsNC60L7QuSDQvtC60LXQsNC9INGB0LDQvNGL0Lkg0LHQvtC70YzRiNC+0Lk/IiwiY2hvaWNlcyI6WyLQotC40YXQuNC5Iiwi0JDRgtC70LDQvdGC0LjRh9C10YHQutC40LkiLCLQmNC90LTQuNC50YHQutC40LkiLCLQodC10LLQtdGA0L3Ri9C5INCb0LXQtNC+0LLQuNGC0YvQuSJdLCJjb3JyZWN0X2Fuc3dlciI6ItCi0LjRhdC40LkifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjIsInF1ZXN0aW9uIjoi0JrQsNC60LDRjyDQv9C70LDQvdC10YLQsCDQsdC70LjQttC1INCy0YHQtdCz0L4g0Log0KHQvtC70L3RhtGDPyIsImNob2ljZXMiOlsi0JLQtdC90LXRgNCwIiwi0JzQtdGA0LrRg9GA0LjQuSIsItCc0LDRgNGBIiwi0JfQtdC80LvRjyJdLCJjb3JyZWN0X2Fuc3dlciI6ItCc0LXRgNC60YPRgNC40LkifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjMsInF1ZXN0aW9uIjoi0JrQsNC60L7QuSDQs9C+0YDQvtC0INGP0LLQu9GP0LXRgtGB0Y8g0YHRgtC+0LvQuNGG0LXQuSDQr9C/0L7QvdC40Lg/IiwiY2hvaWNlcyI6WyLQntGB0LDQutCwIiwi0JrQuNC+0YLQviIsItCi0L7QutC40L4iLCLQndCw0LPQvtGPIl0sImNvcnJlY3RfYW5zd2VyIjoi0KLQvtC60LjQviJ9LHsia2luZCI6InF1aXoiLCJwb3NpdGlvbiI6NCwicXVlc3Rpb24iOiLQmtCw0Log0L7QsdC+0LfQvdCw0YfQsNC10YLRgdGPINCy0L7QtNCwINCyINGF0LjQvNC40Lg/IiwiY2hvaWNlcyI6WyJDT+KCgiIsIk/igoIiLCJI4oKCTyIsIk5hQ2wiXSwiY29ycmVjdF9hbnN3ZXIiOiJI4oKCTyJ9LHsia2luZCI6InF1aXoiLCJwb3NpdGlvbiI6NSwicXVlc3Rpb24iOiLQmtCw0LrQvtC1INC20LjQstC+0YLQvdC+0LUg0LHRi9GB0YLRgNC10LUg0LLRgdC10YUg0LHQtdCz0LDQtdGCINC/0L4g0YHRg9GI0LU/IiwiY2hvaWNlcyI6WyLQm9C10LIiLCLQk9C10L/QsNGA0LQiLCLQkNC90YLQuNC70L7Qv9CwIiwi0JvQvtGI0LDQtNGMIl0sImNvcnJlY3RfYW5zd2VyIjoi0JPQtdC/0LDRgNC0In0seyJraW5kIjoicXVpeiIsInBvc2l0aW9uIjo2LCJxdWVzdGlvbiI6ItCa0YLQviDQvdCw0L/QuNGB0LDQuyDQutCw0YDRgtC40L3RgyDCq9Cc0L7QvdCwINCb0LjQt9Cwwrs/IiwiY2hvaWNlcyI6WyLQoNCw0YTQsNGN0LvRjCIsItCS0LjQvdGB0LXQvdGCINCy0LDQvSDQk9C+0LMiLCLQm9C10L7QvdCw0YDQtNC+INC00LAg0JLQuNC90YfQuCIsItCa0LvQvtC0INCc0L7QvdC1Il0sImNvcnJlY3RfYW5zd2VyIjoi0JvQtdC+0L3QsNGA0LTQviDQtNCwINCS0LjQvdGH0LgifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjcsInF1ZXN0aW9uIjoi0JrQsNC60YPRjiDQv9C70LDQvdC10YLRgyDQvdCw0LfRi9Cy0LDRjtGCINCa0YDQsNGB0L3QvtC5PyIsImNob2ljZXMiOlsi0K7Qv9C40YLQtdGAIiwi0JzQsNGA0YEiLCLQodCw0YLRg9GA0L0iLCLQndC10L/RgtGD0L0iXSwiY29ycmVjdF9hbnN3ZXIiOiLQnNCw0YDRgSJ9LHsia2luZCI6InF1aXoiLCJwb3NpdGlvbiI6OCwicXVlc3Rpb24iOiLQn9GA0Lgg0LrQsNC60L7QuSDRgtC10LzQv9C10YDQsNGC0YPRgNC1INC60LjQv9C40YIg0LLQvtC00LAg0L3QsCDRg9GA0L7QstC90LUg0LzQvtGA0Y8/IiwiY2hvaWNlcyI6WyI4MCDCsEMiLCI5MCDCsEMiLCIxMDAgwrBDIiwiMTIwIMKwQyJdLCJjb3JyZWN0X2Fuc3dlciI6IjEwMCDCsEMifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjksInF1ZXN0aW9uIjoi0JrQsNC60L7QtSDQttC40LLQvtGC0L3QvtC1INGB0YfQuNGC0LDQtdGC0YHRjyDRgdCw0LzRi9C8INCx0L7Qu9GM0YjQuNC8INC90LAg0JfQtdC80LvQtT8iLCJjaG9pY2VzIjpbItCQ0YTRgNC40LrQsNC90YHQutC40Lkg0YHQu9C+0L0iLCLQodC40L3QuNC5INC60LjRgiIsItCW0LjRgNCw0YQiLCLQmtCw0YjQsNC70L7RgiJdLCJjb3JyZWN0X2Fuc3dlciI6ItCh0LjQvdC40Lkg0LrQuNGCIn0seyJraW5kIjoicXVpeiIsInBvc2l0aW9uIjoxMCwicXVlc3Rpb24iOiLQmtGC0L4g0L3QsNC/0LjRgdCw0LsgwqvQnNCw0LvQtdC90YzQutC+0LPQviDQv9GA0LjQvdGG0LDCuz8iLCJjaG9pY2VzIjpbItCW0Y7Qu9GMINCS0LXRgNC9Iiwi0JDQvdGC0YPQsNC9INC00LUg0KHQtdC90YIt0K3QutC30Y7Qv9C10YDQuCIsItCS0LjQutGC0L7RgCDQk9GO0LPQviIsItCQ0LvRjNCx0LXRgCDQmtCw0LzRjiJdLCJjb3JyZWN0X2Fuc3dlciI6ItCQ0L3RgtGD0LDQvSDQtNC1INCh0LXQvdGCLdCt0LrQt9GO0L/QtdGA0LgifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjExLCJxdWVzdGlvbiI6ItCa0LDQuiDQvdCw0LfRi9Cy0LDQtdGC0YHRjyDQtdGB0YLQtdGB0YLQstC10L3QvdGL0Lkg0YHQv9GD0YLQvdC40Log0JfQtdC80LvQuD8iLCJjaG9pY2VzIjpbItCb0YPQvdCwIiwi0JXQstGA0L7Qv9CwIiwi0KLQuNGC0LDQvSIsItCk0L7QsdC+0YEiXSwiY29ycmVjdF9hbnN3ZXIiOiLQm9GD0L3QsCJ9LHsia2luZCI6InF1aXoiLCJwb3NpdGlvbiI6MTIsInF1ZXN0aW9uIjoi0JrQsNC60L7QuSDRhtCy0LXRgiDQv9C+0LvRg9GH0LjRgtGB0Y8sINC10YHQu9C4INGB0LzQtdGI0LDRgtGMINGB0LjQvdC40Lkg0Lgg0LbRkdC70YLRi9C5PyIsImNob2ljZXMiOlsi0J7RgNCw0L3QttC10LLRi9C5Iiwi0KTQuNC+0LvQtdGC0L7QstGL0LkiLCLQl9C10LvRkdC90YvQuSIsItCg0L7Qt9C+0LLRi9C5Il0sImNvcnJlY3RfYW5zd2VyIjoi0JfQtdC70ZHQvdGL0LkifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjEzLCJxdWVzdGlvbiI6ItCjINC60LDQutC+0LPQviDQuNC90YHRgtGA0YPQvNC10L3RgtCwINC+0LHRi9GH0L3QviA4OCDQutC70LDQstC40Yg/IiwiY2hvaWNlcyI6WyLQkNC60LrQvtGA0LTQtdC+0L0iLCLQpNC+0YDRgtC10L/QuNCw0L3QviIsItCe0YDQs9Cw0L0iLCLQodC40L3RgtC10LfQsNGC0L7RgCJdLCJjb3JyZWN0X2Fuc3dlciI6ItCk0L7RgNGC0LXQv9C40LDQvdC+In0seyJraW5kIjoicXVpeiIsInBvc2l0aW9uIjoxNCwicXVlc3Rpb24iOiLQmtCw0LrQvtC1INGH0LjRgdC70L4g0L7QsdC+0LfQvdCw0YfQsNC10YIg0YDQuNC80YHQutCw0Y8g0YbQuNGE0YDQsCBYPyIsImNob2ljZXMiOlsi0J/Rj9GC0YwiLCLQlNC10YHRj9GC0YwiLCLQn9GP0YLRjNC00LXRgdGP0YIiLCLQodGC0L4iXSwiY29ycmVjdF9hbnN3ZXIiOiLQlNC10YHRj9GC0YwifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjE1LCJxdWVzdGlvbiI6ItCa0LDQutCw0Y8g0LbQsNGA0LrQsNGPINC/0YPRgdGC0YvQvdGPINGB0LDQvNCw0Y8g0LHQvtC70YzRiNCw0Y8g0LIg0LzQuNGA0LU/IiwiY2hvaWNlcyI6WyLQk9C+0LHQuCIsItCa0LDQu9Cw0YXQsNGA0LgiLCLQodCw0YXQsNGA0LAiLCLQkNGC0LDQutCw0LzQsCJdLCJjb3JyZWN0X2Fuc3dlciI6ItCh0LDRhdCw0YDQsCJ9LHsia2luZCI6InF1aXoiLCJwb3NpdGlvbiI6MTYsInF1ZXN0aW9uIjoi0JrQsNC60L7QuSDQvNC10YHRj9GGINC40LTRkdGCINC/0LXRgNCy0YvQvCDQsiDQutCw0LvQtdC90LTQsNGA0L3QvtC8INCz0L7QtNGDPyIsImNob2ljZXMiOlsi0JTQtdC60LDQsdGA0YwiLCLQr9C90LLQsNGA0YwiLCLQnNCw0YDRgiIsItCk0LXQstGA0LDQu9GMIl0sImNvcnJlY3RfYW5zd2VyIjoi0K/QvdCy0LDRgNGMIn0seyJraW5kIjoicXVpeiIsInBvc2l0aW9uIjoxNywicXVlc3Rpb24iOiLQktC+0LrRgNGD0LMg0LrQsNC60L7QuSDQt9Cy0LXQt9C00Ysg0L7QsdGA0LDRidCw0LXRgtGB0Y8g0JfQtdC80LvRjz8iLCJjaG9pY2VzIjpbItCh0LjRgNC40YPRgSIsItCf0L7Qu9GP0YDQvdCw0Y8iLCLQodC+0LvQvdGG0LUiLCLQktC10LPQsCJdLCJjb3JyZWN0X2Fuc3dlciI6ItCh0L7Qu9C90YbQtSJ9LHsia2luZCI6InF1aXoiLCJwb3NpdGlvbiI6MTgsInF1ZXN0aW9uIjoi0J3QsCDQutCw0LrQvtC8INGP0LfRi9C60LUg0LPQvtCy0L7RgNGP0YIg0LIg0JHRgNCw0LfQuNC70LjQuD8iLCJjaG9pY2VzIjpbItCY0YHQv9Cw0L3RgdC60LjQuSIsItCf0L7RgNGC0YPQs9Cw0LvRjNGB0LrQuNC5Iiwi0KTRgNCw0L3RhtGD0LfRgdC60LjQuSIsItCY0YLQsNC70YzRj9C90YHQutC40LkiXSwiY29ycmVjdF9hbnN3ZXIiOiLQn9C+0YDRgtGD0LPQsNC70YzRgdC60LjQuSJ9LHsia2luZCI6InF1aXoiLCJwb3NpdGlvbiI6MTksInF1ZXN0aW9uIjoi0KfQtdC80YMg0YDQsNCy0L3QsCDRgdGD0LzQvNCwINGD0LPQu9C+0LIg0L7QsdGL0YfQvdC+0LPQviDRgtGA0LXRg9Cz0L7Qu9GM0L3QuNC60LA/IiwiY2hvaWNlcyI6WyI5MMKwIiwiMTgwwrAiLCIyNzDCsCIsIjM2MMKwIl0sImNvcnJlY3RfYW5zd2VyIjoiMTgwwrAifSx7ImtpbmQiOiJxdWl6IiwicG9zaXRpb24iOjIwLCJxdWVzdGlvbiI6ItCa0LDQutC+0Lkg0LPQsNC3INGA0LDRgdGC0LXQvdC40Y8g0L/QvtCz0LvQvtGJ0LDRjtGCINC40Lcg0LLQvtC30LTRg9GF0LA/IiwiY2hvaWNlcyI6WyLQmtC40YHQu9C+0YDQvtC0Iiwi0JDQt9C+0YIiLCLQo9Cz0LvQtdC60LjRgdC70YvQuSDQs9Cw0LciLCLQktC+0LTQvtGA0L7QtCJdLCJjb3JyZWN0X2Fuc3dlciI6ItCj0LPQu9C10LrQuNGB0LvRi9C5INCz0LDQtyJ9LHsia2luZCI6ImVpdGhlciIsInBvc2l0aW9uIjoxLCJxdWVzdGlvbiI6ItCY0LTQtdCw0LvRjNC90L7QtSDQvdCw0YfQsNC70L4g0LTQvdGPPyIsImNob2ljZXMiOlsi0KDQsNGB0YHQstC10YIg0Lgg0L/RgNC+0LPRg9C70LrQsCIsItCd0LXRgdC/0LXRiNC90YvQuSDQt9Cw0LLRgtGA0LDQuiJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZWl0aGVyIiwicG9zaXRpb24iOjIsInF1ZXN0aW9uIjoi0JrRg9C00LAg0L7RgtC/0YDQsNCy0LjQvNGB0Y8/IiwiY2hvaWNlcyI6WyLQmiDQvNC+0YDRjiIsItCSINCz0L7RgNGLIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6MywicXVlc3Rpb24iOiLQp9GC0L4g0LLRi9Cx0LXRgNC10Lwg0LLQtdGH0LXRgNC+0Lw/IiwiY2hvaWNlcyI6WyLQpNC40LvRjNC8Iiwi0J3QsNGB0YLQvtC70YzQvdGD0Y4g0LjQs9GA0YMiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImVpdGhlciIsInBvc2l0aW9uIjo0LCJxdWVzdGlvbiI6ItCh0LLQuNC00LDQvdC40LUg0LzQtdGH0YLRiz8iLCJjaG9pY2VzIjpbItCa0YDQsNGB0LjQstGL0Lkg0YDQtdGB0YLQvtGA0LDQvSIsItCf0LjQutC90LjQuiDQvdCwINC/0YDQuNGA0L7QtNC1Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6NSwicXVlc3Rpb24iOiLQmtCw0Log0YHQvtGF0YDQsNC90LjQvCDQvNC+0LzQtdC90YI/IiwiY2hvaWNlcyI6WyLQodC00LXQu9Cw0LXQvCDRhNC+0YLQviIsItCX0LDQv9C40YjQtdC8INC40YHRgtC+0YDQuNGOIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6NiwicXVlc3Rpb24iOiLQp9GC0L4g0LLQutC70Y7Rh9C40Lwg0LIg0LTQvtGA0L7Qs9C1PyIsImNob2ljZXMiOlsi0JzRg9C30YvQutGDIiwi0J/QvtC00LrQsNGB0YIiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImVpdGhlciIsInBvc2l0aW9uIjo3LCJxdWVzdGlvbiI6ItCa0YPQtNCwINC/0L7QudC00ZHQvCDQsdC10Lcg0L/Qu9Cw0L3QsD8iLCJjaG9pY2VzIjpbItCSINC30L3QsNC60L7QvNC+0LUg0LzQtdGB0YLQviIsItCY0YHRgdC70LXQtNC+0LLQsNGC0Ywg0L3QvtCy0L7QtSJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZWl0aGVyIiwicG9zaXRpb24iOjgsInF1ZXN0aW9uIjoi0JrQsNC60L7QuSDQv9C+0LTQsNGA0L7QuiDQv9GA0LjRj9GC0L3QtdC1PyIsImNob2ljZXMiOlsi0J/QvtC70LXQt9C90YvQuSIsItCh0LTQtdC70LDQvdC90YvQuSDRgdCy0L7QuNC80Lgg0YDRg9C60LDQvNC4Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6OSwicXVlc3Rpb24iOiLQmtCw0Log0L/RgNC+0LLQtdC00ZHQvCDQtNC+0LbQtNC70LjQstGL0Lkg0LTQtdC90Yw/IiwiY2hvaWNlcyI6WyLQntGB0YLQsNC90LXQvNGB0Y8g0LTQvtC80LAiLCLQktC+0LfRjNC80ZHQvCDQt9C+0L3RgtGLINC4INC/0L7QudC00ZHQvCDQs9GD0LvRj9GC0YwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImVpdGhlciIsInBvc2l0aW9uIjoxMCwicXVlc3Rpb24iOiLQmtCw0LrQvtC5INC00LXRgdC10YDRgiDRgNCw0LfQtNC10LvQuNC8PyIsImNob2ljZXMiOlsi0KjQvtC60L7Qu9Cw0LTQvdGL0LkiLCLQr9Cz0L7QtNC90YvQuSJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZWl0aGVyIiwicG9zaXRpb24iOjExLCJxdWVzdGlvbiI6ItCn0YLQviDQstGL0LHQtdGA0LXQvCDQtNC70Y8g0LLQvtGB0L/QvtC80LjQvdCw0L3QuNC5PyIsImNob2ljZXMiOlsi0JrQvtGA0L7RgtC60L7QtSDQstC40LTQtdC+Iiwi0JDQu9GM0LHQvtC8INGE0L7RgtC+0LPRgNCw0YTQuNC5Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6MTIsInF1ZXN0aW9uIjoi0JrQsNC6INGD0YHRgtGA0L7QuNC8INC80LDQu9C10L3RjNC60L7QtSDQv9GA0LjQutC70Y7Rh9C10L3QuNC1PyIsImNob2ljZXMiOlsi0J/QvtC10LTQtdC8INC90LAg0Y3Qu9C10LrRgtGA0LjRh9C60LUiLCLQn9C+0LnQtNGR0Lwg0L/QtdGI0LrQvtC8INC/0L4g0L3QvtCy0L7QvNGDINC80LDRgNGI0YDRg9GC0YMiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImVpdGhlciIsInBvc2l0aW9uIjoxMywicXVlc3Rpb24iOiLQmtCw0LrQvtC5INCy0LXRh9C10YAg0LfQstGD0YfQuNGCINGD0Y7RgtC90LXQtT8iLCJjaG9pY2VzIjpbItCT0L7RgtC+0LLQuNGC0Ywg0LLQvNC10YHRgtC1Iiwi0JfQsNC60LDQt9Cw0YLRjCDQu9GO0LHQuNC80YPRjiDQtdC00YMiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImVpdGhlciIsInBvc2l0aW9uIjoxNCwicXVlc3Rpb24iOiLQk9C00LUg0LLRgdGC0YDQtdGC0LjQvCDQt9Cw0LrQsNGCPyIsImNob2ljZXMiOlsi0J3QsCDQutGA0YvRiNC1Iiwi0KMg0LLQvtC00YsiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImVpdGhlciIsInBvc2l0aW9uIjoxNSwicXVlc3Rpb24iOiLQp9GC0L4g0L/QvtC/0YDQvtCx0YPQtdC8INCy0LTQstC+0ZHQvD8iLCJjaG9pY2VzIjpbItCd0L7QstGL0Lkg0YHQv9C+0YDRgiIsItCi0LLQvtGA0YfQtdGB0LrQuNC5INC80LDRgdGC0LXRgC3QutC70LDRgdGBIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6MTYsInF1ZXN0aW9uIjoi0JrQsNC60L7QuSDQvtGC0LTRi9GFINGB0LXQudGH0LDRgSDQvdGD0LbQvdC10LU/IiwiY2hvaWNlcyI6WyLQkNC60YLQuNCy0L3Ri9C5Iiwi0KHQvtCy0YHQtdC8INC70LXQvdC40LLRi9C5Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6MTcsInF1ZXN0aW9uIjoi0KfRgtC+INC00L7QsdCw0LLQuNC8INCyINC+0LHRidC40Lkg0L/Qu9C10LnQu9C40YHRgj8iLCJjaG9pY2VzIjpbItCn0YLQvi3RgtC+INGC0LDQvdGG0LXQstCw0LvRjNC90L7QtSIsItCn0YLQvi3RgtC+INGB0L/QvtC60L7QudC90L7QtSJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZWl0aGVyIiwicG9zaXRpb24iOjE4LCJxdWVzdGlvbiI6ItCa0LDQuiDQvtGC0LzQtdGC0LjQvCDQvNCw0LvQtdC90YzQutGD0Y4g0L/QvtCx0LXQtNGDPyIsImNob2ljZXMiOlsi0J/QvtC50LTRkdC8INCz0YPQu9GP0YLRjCIsItCj0YHRgtGA0L7QuNC8INCy0LrRg9GB0L3Ri9C5INGD0LbQuNC9Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJlaXRoZXIiLCJwb3NpdGlvbiI6MTksInF1ZXN0aW9uIjoi0KfRgtC+INCy0LDQttC90LXQtSDQsiDQv9C+0LXQt9C00LrQtT8iLCJjaG9pY2VzIjpbItCa0YDQsNGB0LjQstGL0Lkg0LzQsNGA0YjRgNGD0YIiLCLQo9GO0YLQvdC+0LUg0LzQtdGB0YLQviDQvdC+0YfRkdCy0LrQuCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZWl0aGVyIiwicG9zaXRpb24iOjIwLCJxdWVzdGlvbiI6ItCa0LDQuiDQv9GA0L7QstC10LTRkdC8INGB0LLQvtCx0L7QtNC90YvQuSDRh9Cw0YE/IiwiY2hvaWNlcyI6WyLQn9C+0LPQvtCy0L7RgNC40Lwg0LHQtdC3INGC0LXQu9C10YTQvtC90L7QsiIsItCf0L7RgdC80L7RgtGA0LjQvCDQvtC00L3RgyDRgdC10YDQuNGOIl0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJkYXRlIiwicG9zaXRpb24iOjEsInF1ZXN0aW9uIjoi0J/RgNC40LPQvtGC0L7QstGM0YLQtSDQstC80LXRgdGC0LUg0L3QvtCy0L7QtSDQsdC70Y7QtNC+INC4INC/0YDQuNC00YPQvNCw0LnRgtC1INC10LzRgyDQstCw0YjQtSDQvdCw0LfQstCw0L3QuNC1LiIsImNob2ljZXMiOlsi0JTQvtCz0L7QstC+0YDQuNC70LjRgdGMIiwi0KHQvtGF0YDQsNC90LjQvCDQvdCwINC/0L7RgtC+0LwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImRhdGUiLCJwb3NpdGlvbiI6MiwicXVlc3Rpb24iOiLQktGL0LHQtdGA0LjRgtC1INC90LXQt9C90LDQutC+0LzRg9GOINGD0LvQuNGG0YMg0Lgg0YPRgdGC0YDQvtC50YLQtSDRhNC+0YLQvtC/0YDQvtCz0YPQu9C60YMuIiwiY2hvaWNlcyI6WyLQlNC+0LPQvtCy0L7RgNC40LvQuNGB0YwiLCLQodC+0YXRgNCw0L3QuNC8INC90LAg0L/QvtGC0L7QvCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZGF0ZSIsInBvc2l0aW9uIjozLCJxdWVzdGlvbiI6ItCh0L7QsdC10YDQuNGC0LUg0L/Qu9C10LnQu9C40YHRgiDQuNC3INC00LXRgdGP0YLQuCDQv9C10YHQtdC9INC/0YDQviDQstCw0YjQuCDQvtCx0YnQuNC1INC80L7QvNC10L3RgtGLLiIsImNob2ljZXMiOlsi0JTQvtCz0L7QstC+0YDQuNC70LjRgdGMIiwi0KHQvtGF0YDQsNC90LjQvCDQvdCwINC/0L7RgtC+0LwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImRhdGUiLCJwb3NpdGlvbiI6NCwicXVlc3Rpb24iOiLQo9GB0YLRgNC+0LnRgtC1INCy0LXRh9C10YAg0LHQtdC3INGC0LXQu9C10YTQvtC90L7QsiDRgSDQu9GO0LHQuNC80YvQvNC4INC90LDQv9C40YLQutCw0LzQuCDQuCDRgNCw0LfQs9C+0LLQvtGA0L7QvC4iLCJjaG9pY2VzIjpbItCU0L7Qs9C+0LLQvtGA0LjQu9C40YHRjCIsItCh0L7RhdGA0LDQvdC40Lwg0L3QsCDQv9C+0YLQvtC8Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJkYXRlIiwicG9zaXRpb24iOjUsInF1ZXN0aW9uIjoi0JrRg9C/0LjRgtC1INC00YDRg9CzINC00YDRg9Cz0YMg0L/QviDQvNCw0LvQtdC90YzQutC+0LzRgyDRgdGO0YDQv9GA0LjQt9GDINGBINC+0LTQuNC90LDQutC+0LLRi9C8INCx0Y7QtNC20LXRgtC+0LwuIiwiY2hvaWNlcyI6WyLQlNC+0LPQvtCy0L7RgNC40LvQuNGB0YwiLCLQodC+0YXRgNCw0L3QuNC8INC90LAg0L/QvtGC0L7QvCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZGF0ZSIsInBvc2l0aW9uIjo2LCJxdWVzdGlvbiI6ItCf0L7QstGC0L7RgNC40YLQtSDQstCw0YjQtSDQv9C10YDQstC+0LUg0YHQstC40LTQsNC90LjQtSDigJQg0LjQu9C4INC/0YDQuNC00YPQvNCw0LnRgtC1LCDQutCw0LrQuNC8INC+0L3QviDQvNC+0LPQu9C+INCx0Ysg0LHRi9GC0YwuIiwiY2hvaWNlcyI6WyLQlNC+0LPQvtCy0L7RgNC40LvQuNGB0YwiLCLQodC+0YXRgNCw0L3QuNC8INC90LAg0L/QvtGC0L7QvCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZGF0ZSIsInBvc2l0aW9uIjo3LCJxdWVzdGlvbiI6ItCS0YvQsdC10YDQuNGC0LUg0YTQuNC70YzQvCDQuNC3INC00LXRgtGB0YLQstCwINC60LDQttC00L7Qs9C+INC4INC/0L7RgdC80L7RgtGA0LjRgtC1INC+0LTQuNC9INC40Lcg0L3QuNGFINCy0LzQtdGB0YLQtS4iLCJjaG9pY2VzIjpbItCU0L7Qs9C+0LLQvtGA0LjQu9C40YHRjCIsItCh0L7RhdGA0LDQvdC40Lwg0L3QsCDQv9C+0YLQvtC8Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJkYXRlIiwicG9zaXRpb24iOjgsInF1ZXN0aW9uIjoi0J3QsNC/0LjRiNC40YLQtSDQv9C+INGC0YDQuCDQv9GA0LjRh9C40L3Riywg0LfQsCDQutC+0YLQvtGA0YvQtSDRhtC10L3QuNGC0LUg0LTRgNGD0LMg0LTRgNGD0LPQsCwg0Lgg0L7QsdC80LXQvdGP0LnRgtC10YHRjCDQt9Cw0L/QuNGB0LrQsNC80LguIiwiY2hvaWNlcyI6WyLQlNC+0LPQvtCy0L7RgNC40LvQuNGB0YwiLCLQodC+0YXRgNCw0L3QuNC8INC90LAg0L/QvtGC0L7QvCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZGF0ZSIsInBvc2l0aW9uIjo5LCJxdWVzdGlvbiI6ItCd0LDQudC00LjRgtC1INC60YDQsNGB0LjQstC+0LUg0LzQtdGB0YLQviDRgNGP0LTQvtC8INC4INCy0YHRgtGA0LXRgtGM0YLQtSDRgtCw0Lwg0LfQsNC60LDRgi4iLCJjaG9pY2VzIjpbItCU0L7Qs9C+0LLQvtGA0LjQu9C40YHRjCIsItCh0L7RhdGA0LDQvdC40Lwg0L3QsCDQv9C+0YLQvtC8Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJkYXRlIiwicG9zaXRpb24iOjEwLCJxdWVzdGlvbiI6ItCh0LTQtdC70LDQudGC0LUg0LTQvtC80LDRiNC90Y7RjiDQtNC10LPRg9GB0YLQsNGG0LjRjiDRgtGA0ZHRhSDQvdC10L7QsdGL0YfQvdGL0YUg0LLQutGD0YHQvtCyLiIsImNob2ljZXMiOlsi0JTQvtCz0L7QstC+0YDQuNC70LjRgdGMIiwi0KHQvtGF0YDQsNC90LjQvCDQvdCwINC/0L7RgtC+0LwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImRhdGUiLCJwb3NpdGlvbiI6MTEsInF1ZXN0aW9uIjoi0JLRi9Cx0LXRgNC40YLQtSDRgdC70YPRh9Cw0LnQvdGD0Y4g0L7RgdGC0LDQvdC+0LLQutGDINC4INC/0YDQvtCz0YPQu9GP0LnRgtC10YHRjCDQstC+0LrRgNGD0LMg0L3QtdGRINCx0LXQtyDQvNCw0YDRiNGA0YPRgtCwLiIsImNob2ljZXMiOlsi0JTQvtCz0L7QstC+0YDQuNC70LjRgdGMIiwi0KHQvtGF0YDQsNC90LjQvCDQvdCwINC/0L7RgtC+0LwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImRhdGUiLCJwb3NpdGlvbiI6MTIsInF1ZXN0aW9uIjoi0KHQvtC30LTQsNC50YLQtSDQvNCw0LvQtdC90YzQutGD0Y4g0LrQsNGA0YLRgyDQvNC10YHRgiwg0LrRg9C00LAg0YXQvtGC0LjRgtC1INGB0YXQvtC00LjRgtGMINCy0LTQstC+0ZHQvC4iLCJjaG9pY2VzIjpbItCU0L7Qs9C+0LLQvtGA0LjQu9C40YHRjCIsItCh0L7RhdGA0LDQvdC40Lwg0L3QsCDQv9C+0YLQvtC8Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJkYXRlIiwicG9zaXRpb24iOjEzLCJxdWVzdGlvbiI6ItCj0YHRgtGA0L7QudGC0LUg0LLQtdGH0LXRgCDQstC+0L/RgNC+0YHQvtCyOiDQv9C+INC+0YfQtdGA0LXQtNC4INC30LDQtNCw0LnRgtC1INC00YDRg9CzINC00YDRg9Cz0YMg0L/QviDQv9GP0YLRjCDQvdC+0LLRi9GFINCy0L7Qv9GA0L7RgdC+0LIuIiwiY2hvaWNlcyI6WyLQlNC+0LPQvtCy0L7RgNC40LvQuNGB0YwiLCLQodC+0YXRgNCw0L3QuNC8INC90LAg0L/QvtGC0L7QvCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZGF0ZSIsInBvc2l0aW9uIjoxNCwicXVlc3Rpb24iOiLQodC90LjQvNC40YLQtSDQutC+0YDQvtGC0LrQvtC1INCy0LjQtNC10L4gwqvQvdCw0Ygg0L7QsdGL0YfQvdGL0Lkg0YHRh9Cw0YHRgtC70LjQstGL0Lkg0LTQtdC90YzCuy4iLCJjaG9pY2VzIjpbItCU0L7Qs9C+0LLQvtGA0LjQu9C40YHRjCIsItCh0L7RhdGA0LDQvdC40Lwg0L3QsCDQv9C+0YLQvtC8Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJkYXRlIiwicG9zaXRpb24iOjE1LCJxdWVzdGlvbiI6ItCS0YvQsdC10YDQuNGC0LUg0YDQtdGG0LXQv9GCINC00LXRgdC10YDRgtCwLCDQutC+0YLQvtGA0YvQuSDQvdC40LrRgtC+INC40Lcg0LLQsNGBINC10YnRkSDQvdC1INCz0L7RgtC+0LLQuNC7LiIsImNob2ljZXMiOlsi0JTQvtCz0L7QstC+0YDQuNC70LjRgdGMIiwi0KHQvtGF0YDQsNC90LjQvCDQvdCwINC/0L7RgtC+0LwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImRhdGUiLCJwb3NpdGlvbiI6MTYsInF1ZXN0aW9uIjoi0KHQvtCx0LXRgNC40YLQtSDQtNC+0LzQsCDQvNC40L3QuC3Qv9C40LrQvdC40Lo6INC/0LvQtdC0LCDRhNGA0YPQutGC0YssINC80YPQt9GL0LrQsCDQuCDQvNGP0LPQutC40Lkg0YHQstC10YIuIiwiY2hvaWNlcyI6WyLQlNC+0LPQvtCy0L7RgNC40LvQuNGB0YwiLCLQodC+0YXRgNCw0L3QuNC8INC90LAg0L/QvtGC0L7QvCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH0seyJraW5kIjoiZGF0ZSIsInBvc2l0aW9uIjoxNywicXVlc3Rpb24iOiLQndCw0YDQuNGB0YPQudGC0LUg0L/QviDQv9C+0YDRgtGA0LXRgtGDINC00YDRg9CzINC00YDRg9Cz0LAsINC90LUg0YHRgtCw0YDQsNGP0YHRjCDQsdGL0YLRjCDRgdC10YDRjNGR0LfQvdGL0LzQuC4iLCJjaG9pY2VzIjpbItCU0L7Qs9C+0LLQvtGA0LjQu9C40YHRjCIsItCh0L7RhdGA0LDQvdC40Lwg0L3QsCDQv9C+0YLQvtC8Il0sImNvcnJlY3RfYW5zd2VyIjpudWxsfSx7ImtpbmQiOiJkYXRlIiwicG9zaXRpb24iOjE4LCJxdWVzdGlvbiI6ItCS0YvQsdC10YDQuNGC0LUg0L7QsdGJ0YPRjiDQvNC10YfRgtGDINC4INC/0YDQuNC00YPQvNCw0LnRgtC1INC+0LTQuNC9INC80LDQu9C10L3RjNC60LjQuSDRiNCw0LMg0Log0L3QtdC5LiIsImNob2ljZXMiOlsi0JTQvtCz0L7QstC+0YDQuNC70LjRgdGMIiwi0KHQvtGF0YDQsNC90LjQvCDQvdCwINC/0L7RgtC+0LwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImRhdGUiLCJwb3NpdGlvbiI6MTksInF1ZXN0aW9uIjoi0KPRgdGC0YDQvtC50YLQtSDQv9GA0L7Qs9GD0LvQutGDINC+0LTQvdC+0LPQviDRhtCy0LXRgtCwOiDQt9Cw0LzQtdGH0LDQudGC0LUg0Lgg0YTQvtGC0L7Qs9GA0LDRhNC40YDRg9C50YLQtSDRgtC+0LvRjNC60L4g0LXQs9C+LiIsImNob2ljZXMiOlsi0JTQvtCz0L7QstC+0YDQuNC70LjRgdGMIiwi0KHQvtGF0YDQsNC90LjQvCDQvdCwINC/0L7RgtC+0LwiXSwiY29ycmVjdF9hbnN3ZXIiOm51bGx9LHsia2luZCI6ImRhdGUiLCJwb3NpdGlvbiI6MjAsInF1ZXN0aW9uIjoi0J3QsNC/0LjRiNC40YLQtSDQv9C40YHRjNC80L4g0LLQsNC8INC00LLQvtC40Lwg0LIg0LHRg9C00YPRidC10LUg0Lgg0L3QsNC30L3QsNGH0YzRgtC1INC00LDRgtGDINC+0YLQutGA0YvRgtC40Y8uIiwiY2hvaWNlcyI6WyLQlNC+0LPQvtCy0L7RgNC40LvQuNGB0YwiLCLQodC+0YXRgNCw0L3QuNC8INC90LAg0L/QvtGC0L7QvCJdLCJjb3JyZWN0X2Fuc3dlciI6bnVsbH1d', 'base64'), 'utf8')::jsonb as value
), catalog as (
  select item.*
  from source,
  jsonb_to_recordset(source.value) as item(
    kind text,
    position smallint,
    question text,
    choices jsonb,
    correct_answer text
  )
)
insert into public.loveloom_game_questions(
  kind, position, question, choices, correct_answer
)
select kind, position, question, choices, correct_answer
from catalog
order by kind, position;

alter table public.loveloom_games
  add column question_id bigint
  references public.loveloom_game_questions(id) on delete restrict;

create index loveloom_games_question_idx
  on public.loveloom_games(question_id)
  where question_id is not null;

create or replace function private.loveloom_is_touch_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.loveloom_room_members member
    where member.user_id = (select auth.uid())
      and p_topic in (
        'loveloom:touch:' || member.room_id::text,
        'loveloom:sync:' || member.room_id::text
      )
  );
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
  v_partner_read bigint := 0;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, null);
  select epoch into v_epoch
  from public.loveloom_rooms
  where id = v_room_id;

  select coalesce(max(read_state.last_read_seq), 0)
  into v_partner_read
  from public.loveloom_chat_reads read_state
  where read_state.room_id = v_room_id
    and read_state.user_id <> v_uid;

  with page as (
    select message.*
    from public.loveloom_messages message
    where message.room_id = v_room_id
      and (p_before is null or message.seq < p_before)
    order by message.seq desc
    limit 41
  ), visible as (
    select * from page order by seq desc limit 40
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'seq', visible.seq,
        'id', visible.id,
        'author', visible.author_id,
        'text', visible.body,
        'created', floor(extract(epoch from visible.created_at) * 1000)::bigint,
        'media', case when media.id is null then null else jsonb_build_object(
          'id', media.id,
          'room', media.room_id,
          'author', media.author_id,
          'kind', media.kind,
          'context', media.context,
          'mime', media.mime_type,
          'bytes', media.byte_size,
          'caption', media.caption,
          'path', media.storage_path,
          'created', floor(extract(epoch from media.created_at) * 1000)::bigint
        ) end,
        'reply', case when replied.id is null then null else jsonb_build_object(
          'id', replied.id,
          'author', replied.author_id,
          'text', left(replied.body, 240),
          'mediaKind', replied_media.kind
        ) end,
        'reactions', coalesce(reaction_set.items, '[]'::jsonb)
      ) order by visible.seq asc
    ), '[]'::jsonb),
    (select count(*) > 40 from page)
  into v_messages, v_has_more
  from visible
  left join public.loveloom_media media
    on media.id = visible.media_id
  left join public.loveloom_messages replied
    on replied.id = visible.reply_to
    and replied.room_id = v_room_id
  left join public.loveloom_media replied_media
    on replied_media.id = replied.media_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'emoji', grouped.emoji,
        'users', grouped.users
      ) order by grouped.first_created
    ) as items
    from (
      select
        reaction.emoji,
        jsonb_agg(reaction.user_id order by reaction.created_at) as users,
        min(reaction.created_at) as first_created
      from public.loveloom_message_reactions reaction
      where reaction.message_id = visible.id
      group by reaction.emoji
    ) grouped
  ) reaction_set on true;

  return jsonb_build_object(
    'messages', v_messages,
    'hasMore', coalesce(v_has_more, false),
    'epoch', v_epoch,
    'partnerReadSeq', v_partner_read
  );
end;
$$;

create or replace function public.loveloom_add_message(
  p_epoch integer,
  p_text text,
  p_reply_to uuid
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
  if p_reply_to is not null and not exists (
    select 1
    from public.loveloom_messages message
    where message.id = p_reply_to
      and message.room_id = v_room_id
  ) then
    raise exception 'Сообщение для ответа больше недоступно.';
  end if;

  insert into public.loveloom_messages(
    room_id, author_id, body, reply_to
  ) values (
    v_room_id, v_uid, v_text, p_reply_to
  ) returning id into v_id;

  delete from public.loveloom_messages old
  where old.room_id = v_room_id
    and old.seq in (
      select message.seq
      from public.loveloom_messages message
      where message.room_id = v_room_id
      order by message.seq desc
      offset 1000
    );
  return v_id;
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
  p_caption text,
  p_reply_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_result uuid;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if p_reply_to is not null and p_context <> 'chat' then
    raise exception 'Ответ можно прикрепить только к сообщению.';
  end if;
  if p_reply_to is not null and not exists (
    select 1
    from public.loveloom_messages message
    where message.id = p_reply_to
      and message.room_id = v_room_id
  ) then
    raise exception 'Сообщение для ответа больше недоступно.';
  end if;

  v_result := public.loveloom_register_media(
    p_id, p_epoch, p_path, p_kind, p_context,
    p_mime, p_bytes, p_caption
  );
  if p_context = 'chat' and p_reply_to is not null and exists (
    select 1
    from public.loveloom_messages message
    where message.id = p_reply_to
      and message.room_id = v_room_id
  ) then
    update public.loveloom_messages
    set reply_to = p_reply_to
    where id = v_result and room_id = v_room_id;
  end if;
  return v_result;
end;
$$;

create or replace function public.loveloom_react_message(
  p_epoch integer,
  p_message_id uuid,
  p_emoji text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room_id uuid;
  v_current text;
  v_emoji text := btrim(coalesce(p_emoji, ''));
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);
  if v_emoji not in ('💗', '😘', '😂', '🥹', '🤗', '👍') then
    raise exception 'Эта реакция пока не поддерживается.';
  end if;
  if not exists (
    select 1
    from public.loveloom_messages message
    where message.id = p_message_id
      and message.room_id = v_room_id
  ) then
    raise exception 'Сообщение больше недоступно.';
  end if;

  select reaction.emoji into v_current
  from public.loveloom_message_reactions reaction
  where reaction.message_id = p_message_id
    and reaction.user_id = v_uid;

  if v_current = v_emoji then
    delete from public.loveloom_message_reactions
    where message_id = p_message_id and user_id = v_uid;
    return jsonb_build_object('selected', null);
  end if;

  insert into public.loveloom_message_reactions(
    message_id, user_id, emoji, created_at
  ) values (
    p_message_id, v_uid, v_emoji, now()
  )
  on conflict (message_id, user_id) do update
    set emoji = excluded.emoji,
        created_at = excluded.created_at;

  return jsonb_build_object('selected', v_emoji);
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
  from public.loveloom_game_answers
  where game_id = v_game.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user', answer.user_id,
      'answer', case
        when v_complete or answer.user_id = v_uid
        then answer.answer ->> 'answer'
        else null
      end,
      'guess', case
        when v_complete or answer.user_id = v_uid
        then answer.answer ->> 'guess'
        else null
      end
    ) order by answer.created_at
  ), '[]'::jsonb)
  into v_responses
  from public.loveloom_game_answers answer
  where answer.game_id = v_game.id;

  if v_complete and v_game.kind = 'quiz' then
    select question.correct_answer into v_correct
    from public.loveloom_game_questions question
    where question.id = v_game.question_id;
    if v_correct is null then
      v_correct := case v_game.question
        when 'Какой океан самый большой?' then 'Тихий'
        when 'Какая планета ближе всего к Солнцу?' then 'Меркурий'
        else null
      end;
    end if;
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
  v_latest uuid;
  v_previous text;
  v_answer_count integer;
  v_member_count integer;
  v_question public.loveloom_game_questions%rowtype;
begin
  if v_uid is null then raise exception 'Войдите в аккаунт.'; end if;
  v_room_id := private.loveloom_require_room(v_uid, p_epoch);

  -- Serialize round creation per room. Two simultaneous taps must never create
  -- two active questions for the same pair.
  perform 1
  from public.loveloom_rooms room
  where room.id = v_room_id
  for update;

  select count(*)::integer into v_member_count
  from public.loveloom_room_members
  where room_id = v_room_id;
  if v_member_count <> 2 then
    raise exception 'Пригласите второго участника, чтобы играть вместе.';
  end if;

  select id into v_latest
  from public.loveloom_games
  where room_id = v_room_id
  order by created_at desc
  limit 1;
  if v_latest is not null then
    select count(*)::integer into v_answer_count
    from public.loveloom_game_answers
    where game_id = v_latest;
    if v_answer_count < 2 then
      raise exception 'Сначала завершите текущий раунд.';
    end if;
  end if;

  if p_kind not in ('know', 'quiz', 'either', 'date') then
    raise exception 'Неизвестная игра.';
  end if;

  select game.question into v_previous
  from public.loveloom_games game
  where game.room_id = v_room_id
    and game.kind = p_kind
  order by game.created_at desc
  limit 1;

  select question.* into v_question
  from public.loveloom_game_questions question
  where question.kind = p_kind
    and (v_previous is null or question.question <> v_previous)
  order by random()
  limit 1;

  if v_question.id is null then
    raise exception 'Вопросы этой игры пока недоступны.';
  end if;

  insert into public.loveloom_games(
    room_id, kind, question, choices, question_id
  ) values (
    v_room_id, p_kind, v_question.question,
    v_question.choices, v_question.id
  )
  returning id into v_game_id;

  return v_game_id;
end;
$$;

revoke all on function public.loveloom_add_message(integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.loveloom_register_media(
  uuid, integer, text, text, text, text, bigint, text, uuid
) from public, anon, authenticated;
revoke all on function public.loveloom_react_message(integer, uuid, text)
  from public, anon, authenticated;

grant execute on function public.loveloom_add_message(integer, text, uuid)
  to authenticated;
grant execute on function public.loveloom_register_media(
  uuid, integer, text, text, text, text, bigint, text, uuid
) to authenticated;
grant execute on function public.loveloom_react_message(integer, uuid, text)
  to authenticated;

comment on table public.loveloom_message_reactions is
  'One validated room-scoped reaction per participant and chat message.';
comment on table public.loveloom_game_questions is
  'Server-owned catalog of 20 questions for each LoveLoom beta 0.6 pair game.';
comment on column public.loveloom_messages.reply_to is
  'Optional immutable reference used to render a safe reply preview.';
