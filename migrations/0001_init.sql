CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  type TEXT NOT NULL,
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  incorrect_answers TEXT NOT NULL,
  question_hash TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_group_difficulty ON questions(group_id, difficulty);

CREATE TABLE IF NOT EXISTS ingestion_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  pulled INTEGER NOT NULL,
  added INTEGER NOT NULL,
  rejected_duplicate INTEGER NOT NULL,
  rejected_quality INTEGER NOT NULL
);
