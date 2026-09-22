-- Execute após aplicar a migração. Qualquer divergência interrompe o bloco.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'RLS precisa estar ativo em public.profiles';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.study_entries'::regclass) then
    raise exception 'RLS precisa estar ativo em public.study_entries';
  end if;

  if not has_table_privilege('anon', 'public.profiles', 'select')
     or not has_table_privilege('anon', 'public.study_entries', 'select') then
    raise exception 'Convidados precisam conseguir visualizar os dados';
  end if;

  if not has_table_privilege('authenticated', 'public.profiles', 'select')
     or not has_table_privilege('authenticated', 'public.study_entries', 'select') then
    raise exception 'Usuários autenticados precisam conseguir ler o grupo';
  end if;

  if has_table_privilege('authenticated', 'public.study_entries', 'delete') then
    raise exception 'Exclusão não deve estar disponível';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'study_entries'
      and cmd = 'INSERT'
      and policyname = 'Users can insert their own non-future entry'
  ) then
    raise exception 'Política de INSERT não encontrada';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'study_entries'
      and cmd = 'UPDATE'
      and policyname = 'Users can update their own non-future entry'
  ) then
    raise exception 'Política de UPDATE não encontrada';
  end if;
end
$$;
