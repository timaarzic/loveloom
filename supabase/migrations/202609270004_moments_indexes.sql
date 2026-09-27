-- Cover user foreign keys used during account deletion and room cleanup.
create index loveloom_capsules_author_idx
  on public.loveloom_capsules(author_id);

create index loveloom_garden_actions_user_idx
  on public.loveloom_garden_actions(user_id);
