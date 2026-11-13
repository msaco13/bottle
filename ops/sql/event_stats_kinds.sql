-- The stats page's "how it went" table now also lists pictures, the contact picker and installs.
-- It edits the list of kinds inside event_stats in place, and refuses if the function is not as expected.
-- Applied 2026-11-13, in the Bottle project only (ref segtizidayglyouweszn).
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'event_stats';
  if d is null or position('''view'', ''preview'', ''pace'') group by' in d) = 0 then raise exception 'event_stats is not as expected'; end if;
  d := replace(d, '''view'', ''preview'', ''pace'') group by', '''view'', ''preview'', ''pace'', ''pic'', ''pick'', ''install'') group by');
  execute d;
end $$;

-- Later the same day: lanterns lit for someone, beaches from everyone, and writing in the sand are listed too.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'event_stats';
  if d is null or position('''pic'', ''pick'', ''install'') group by' in d) = 0 then raise exception 'event_stats is not as expected'; end if;
  d := replace(d, '''pic'', ''pick'', ''install'') group by', '''pic'', ''pick'', ''install'', ''lamp'', ''gather'', ''sand'') group by');
  execute d;
end $$;
