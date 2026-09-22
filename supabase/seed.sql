-- Execute depois de criar os três usuários no painel de Auth.
insert into public.profiles (id, display_name)
select
  id,
  case email
    when 'tori@togazzmis.app' then 'Tori'
    when 'misthios@togazzmis.app' then 'Misthios'
    when 'gaziim@togazzmis.app' then 'Gaziim'
  end
from auth.users
where email in (
  'tori@togazzmis.app',
  'misthios@togazzmis.app',
  'gaziim@togazzmis.app'
)
on conflict (id) do update
set display_name = excluded.display_name;
