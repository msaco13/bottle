-- Pictures in bottles.
--
-- A picture cannot travel inside a link, so it is kept here: scrambled on the phone before it
-- leaves (AES-GCM), under a name worked out from a secret that only travels inside the link.
-- The server holds unreadable bytes and cannot tell a photo from a GIF, or whose it is.
--
-- The bucket is public to read (a picture is fetched by its name, which cannot be guessed, and is
-- useless without the secret) and open to add to, with brakes:
--   - one file is at most 4 MB, and only plain bytes are accepted
--   - a name must be 40 hex characters
--   - at most 60 a minute, and 200,000 in all (about 100 GB at their usual size)
-- Nobody outside can list, change or delete what is there. A link that carries a picture must
-- keep working, so pictures are never tidied away.
--
-- Apply once, in the Bottle project only (ref segtizidayglyouweszn).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pictures', 'pictures', true, 4194304, array['application/octet-stream'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Is there room for one more? Asked by the rule below, which cannot count the pictures itself.
create or replace function public.picture_room()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (select count(*) from storage.objects o where o.bucket_id = 'pictures' and o.created_at > now() - interval '1 minute') < 60
     and (select count(*) from storage.objects o where o.bucket_id = 'pictures') < 200000;
$function$;

revoke all on function public.picture_room() from public;
grant execute on function public.picture_room() to anon, authenticated, service_role;

drop policy if exists "bottle pictures can be added, with brakes" on storage.objects;
create policy "bottle pictures can be added, with brakes" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'pictures' and name ~ '^[0-9a-f]{40}$' and public.picture_room());
