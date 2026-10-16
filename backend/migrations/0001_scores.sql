CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  score INTEGER CHECK(score IS NULL OR (score >= 0 AND score <= 1000000))
);
CREATE INDEX runs_player_time ON runs(player, started_at);
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  best INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX players_best ON players(best DESC);
