-- Sprint 8: Prompts table + daily selection tracker
-- Run this in the Supabase SQL editor before running functions.sql or seed.sql

CREATE TABLE prompts (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',  -- 'draft' | 'approved' | 'retired'
  used_at DATE,                              -- NULL if never used
  scheduled_for DATE,                        -- NULL unless explicitly scheduled for a date
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT                                 -- optional admin notes
);

CREATE TABLE daily_prompt (
  date DATE PRIMARY KEY,
  prompt_id BIGINT NOT NULL REFERENCES prompts(id),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompts_status_used ON prompts (status, used_at);
CREATE INDEX idx_prompts_scheduled ON prompts (scheduled_for);

ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prompt ENABLE ROW LEVEL SECURITY;

-- Anonymous users can read (needed for the RPC to work)
CREATE POLICY "Anyone can read prompts" ON prompts
  FOR SELECT USING (true);

CREATE POLICY "Anyone can read daily_prompt" ON daily_prompt
  FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE for anonymous users — all writes go through the RPC function
