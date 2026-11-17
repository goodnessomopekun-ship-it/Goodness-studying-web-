create table topics(id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, notes text default '', created_at timestamptz default now());
create table lessons(id uuid primary key default gen_random_uuid(), topic_id uuid not null references topics on delete cascade, user_id uuid not null default auth.uid(), title text not null, url text default '', notes text default '', done boolean not null default false, created_at timestamptz default now());
create table questions(id uuid primary key default gen_random_uuid(), topic_id uuid not null references topics on delete cascade, user_id uuid not null default auth.uid(), q text not null, a text default '', got boolean, created_at timestamptz default now());
create table certificates(no text primary key default 'GW-' || upper(substr(md5(gen_random_uuid()::text),1,10)), user_id uuid not null, topic_id uuid not null, name text not null, topic_name text not null, issued_at timestamptz not null default now(), unique(user_id, topic_id));
alter table topics enable row level security; alter table lessons enable row level security; alter table questions enable row level security; alter table certificates enable row level security;
create policy own on topics for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on lessons for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own on questions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_read on certificates for select using (user_id = auth.uid());
create function issue_certificate(p_topic uuid) returns text language plpgsql security definer set search_path = public as $$
declare t topics; n text;
begin
  select * into t from topics where id = p_topic and user_id = auth.uid();
  if not found then raise exception 'Topic not found'; end if;
  if not exists (select 1 from lessons where topic_id = p_topic)
     or exists (select 1 from lessons where topic_id = p_topic and not done)
     or exists (select 1 from questions where topic_id = p_topic and got is not true)
  then raise exception 'Finish every lesson and question first'; end if;
  select no into n from certificates where topic_id = p_topic and user_id = auth.uid();
  if n is null then
    insert into certificates(user_id, topic_id, name, topic_name)
    values (auth.uid(), p_topic, coalesce(auth.jwt()->'user_metadata'->>'full_name', 'Student'), t.name) returning no into n;
  end if;
  return n;
end $$;
create function verify_certificate(cert_no text) returns table(name text, topic_name text, issued_at timestamptz) language sql security definer set search_path = public as $$
  select name, topic_name, issued_at from certificates where no = upper(trim(cert_no));
$$;
revoke execute on function issue_certificate(uuid) from public, anon;
grant execute on function issue_certificate(uuid) to authenticated;
grant execute on function verify_certificate(text) to anon, authenticated;
