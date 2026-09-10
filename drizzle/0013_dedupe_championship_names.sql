-- Renomeia campeonatos com nome repetido antes de criar o índice único:
-- mantém o mais antigo e sufixa os demais com " #2", " #3", …
WITH ranked AS (
  SELECT id, name, row_number() OVER (
    PARTITION BY lower(btrim(name)) ORDER BY created_at, id
  ) AS rn
  FROM championship
)
UPDATE championship c
SET name = ranked.name || ' #' || ranked.rn
FROM ranked
WHERE c.id = ranked.id AND ranked.rn > 1;
