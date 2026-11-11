-- People: optional title and team for each member (managers set these).
alter table memberships add column if not exists title text;
alter table memberships add column if not exists team  text;
select 'ok' as status;
