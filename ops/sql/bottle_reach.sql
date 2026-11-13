-- Who else is in a conversation, and can their phone be told?
--
-- For a member of the conversation: how many other phones have joined it, and how many of those
-- have a lantern lit. The page uses it to decide whether a bottle can go straight to the other
-- shore ("Send to Jorge") or needs a link texted ("Create bottle"), and to show "lantern lit"
-- beside a name. Anyone who is not a member is told nothing: zeros.
--
-- It only reads. It returns two counts and nothing else: no names, no notes, no addresses.
-- The page works without it (it then learns from the answer to each send), so this can be
-- applied before or after the page that calls it is published.
--
-- Apply once, in the Bottle project only (ref segtizidayglyouweszn).

create or replace function public.bottle_reach(p_auth text, p_thread text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_shore text;
begin
  if p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' or p_thread is null or p_thread !~ '^[A-Za-z0-9_-]{22}$' then
    return jsonb_build_object('others', 0, 'lit', 0);
  end if;
  v_shore := encode(sha256(convert_to('bottle-shore:' || p_auth, 'UTF8')), 'hex');
  if not exists (select 1 from public.members m where m.thread = p_thread and m.shore = v_shore) then
    return jsonb_build_object('others', 0, 'lit', 0);
  end if;
  return jsonb_build_object(
    'others', (select count(*) from public.members m where m.thread = p_thread and m.shore <> v_shore),
    'lit', (select count(distinct m.shore) from public.members m join public.push_subs s on s.shore = m.shore
            where m.thread = p_thread and m.shore <> v_shore));
end $function$;

revoke all on function public.bottle_reach(text, text) from public;
grant execute on function public.bottle_reach(text, text) to anon, authenticated, service_role;
