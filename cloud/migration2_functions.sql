-- ============================================================================
-- Fitma Tick (Cloud) — onboarding helper functions + teammate visibility
-- These run as SECURITY DEFINER so the very first owner-membership and invite
-- acceptance can be created without tripping the "must already be a manager"
-- RLS rule (the chicken-and-egg problem).
-- ============================================================================

-- Create a company and make the caller its owner, atomically.
create or replace function create_company(p_name text, p_slug text)
returns companies
language plpgsql security definer set search_path = public as $$
declare c companies;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into companies(name, slug, owner_id, plan_code, sub_status)
    values (p_name, p_slug, auth.uid(), 'trial', 'trialing')
    returning * into c;
  insert into memberships(company_id, user_id, role, status)
    values (c.id, auth.uid(), 'owner', 'active');
  insert into profiles(id) values (auth.uid()) on conflict (id) do nothing;
  return c;
end $$;

-- Accept an invite by token: creates (or re-activates) the caller's membership.
create or replace function accept_invite(p_token text)
returns memberships
language plpgsql security definer set search_path = public as $$
declare inv invites; m memberships;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from invites
    where token = p_token and accepted_at is null and expires_at > now();
  if inv.id is null then raise exception 'invite not found or expired'; end if;
  insert into memberships(company_id, user_id, role, status)
    values (inv.company_id, auth.uid(), inv.role, 'active')
    on conflict (company_id, user_id)
      do update set status = 'active', role = excluded.role
    returning * into m;
  update invites set accepted_at = now() where id = inv.id;
  insert into profiles(id) values (auth.uid()) on conflict (id) do nothing;
  return m;
end $$;

-- Do the caller and <other> share an active company? (used by the profiles policy)
create or replace function shares_company(other uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships a
    join memberships b on a.company_id = b.company_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = other and b.status = 'active') $$;

-- Teammates can read each other's profile (name/avatar) for the roster.
drop policy if exists profiles_teammates on profiles;
create policy profiles_teammates on profiles for select using (shares_company(id));

grant execute on function create_company(text, text) to authenticated;
grant execute on function accept_invite(text)        to authenticated;
grant execute on function shares_company(uuid)       to authenticated;
