# Acompanhamento de Estudo

Aplicação web para acompanhar realização diária de exercícios de matérias da faculdade.

Cada pessoa pode registrar exercícios e observações para o dia atual ou dias anteriores, enquanto todos visualizam o acompanhamento do grupo no calendário e no resumo semanal.

## Recursos

- Login para usuários já preestabelecidos. Além de ter um acesso para convidados visualizar.
- Visões de "Hoje", "Essa semana" e "Calendário".
- Possibilidade de visulizar e editar dados de dias antigos acessados pelo calendário.
- Registrar exercícios de matérias da faculdade (inicialmente, Pré-Cálculo, Cálculo e Matemática Discreta), com observações opcionais.
- Datas futuras visíveis, mas bloqueadas para edição.
- Persistência de dados no Supabase.
- Interface responsiva para computador e celular.

## Tecnologias

- HTML, CSS e JavaScript puros.
- Supabase Auth para login e sessão.
- Supabase PostgreSQL para os dados.
- Vercel para hospedagem estática.

## Estrutura do projeto

- `index.html`: estrutura das telas.
- `styles.css`: estilos responsivos.
- `app.js`: login, calendário, resumos e persistência.
- `config.js`: URL e chave pública do Supabase.
- `supabase/migrations/`: esquema do banco e regras de acesso.
- `supabase/seed.sql`: associação das contas aos perfis do grupo.
- `vercel.json`: rotas necessárias para o calendário e as páginas diárias funcionarem ao recarregar.