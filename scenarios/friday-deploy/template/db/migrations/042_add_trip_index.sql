-- 042: speed up "my trips" (release v5.2.0). {{TABLE}} has ~40 million rows in production.
CREATE INDEX {{INDEX_NAME}} ON {{TABLE}} ({{COLUMN}});
