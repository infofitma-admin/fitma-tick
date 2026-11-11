-- Pre-authorise Fitma's operator by email, so is_platform_admin() is true
-- as soon as that account signs in (works even before the account exists).
create table if not exists platform_admin_emails (
  email      text primary key,
  created_at timestamptz not null default now()
);
insert into platform_admin_emails(email) values ('info.fitma@gmail.com') on conflict do nothing;

create or replace function is_platform_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
      or exists (
        select 1 from auth.users u
        where u.id = auth.uid()
          and lower(u.email) in (select lower(email) from platform_admin_emails)
      )
$$;

-- if that account already exists, add it to platform_admins too (harmless)
insert into platform_admins(user_id)
  select id from auth.users where lower(email) = 'info.fitma@gmail.com'
  on conflict do nothing;

select email from platform_admin_emails;
