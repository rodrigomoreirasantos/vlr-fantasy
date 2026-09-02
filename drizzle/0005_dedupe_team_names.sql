-- Desduplicação manual (custom): antes de criar o índice único
-- `fantasy_team_name_uidx` (lower(btrim(name))), renomeia qualquer time
-- duplicado — mantém o mais antigo com o nome original e sufixa os demais
-- com " #2", " #3", … na ordem de criação.
WITH ranked AS (
  SELECT id, name, row_number() OVER (
    PARTITION BY lower(btrim(name)) ORDER BY created_at, id
  ) AS rn
  FROM fantasy_team
)
UPDATE fantasy_team ft
SET name = ranked.name || ' #' || ranked.rn
FROM ranked
WHERE ft.id = ranked.id AND ranked.rn > 1;
