-- Sprint 8: Daily prompt selection function
-- Run this in the Supabase SQL editor after running schema.sql

CREATE OR REPLACE FUNCTION get_or_create_daily_prompt()
RETURNS TABLE(text TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  selected_id BIGINT;
BEGIN
  -- Step 1: Has today's prompt already been selected?
  SELECT prompt_id INTO selected_id
  FROM daily_prompt
  WHERE date = today;

  IF selected_id IS NOT NULL THEN
    RETURN QUERY SELECT p.text FROM prompts p WHERE p.id = selected_id;
    RETURN;
  END IF;

  -- Step 2: Is there a prompt explicitly scheduled for today?
  SELECT id INTO selected_id
  FROM prompts
  WHERE status = 'approved' AND scheduled_for = today
  LIMIT 1;

  -- Step 3: If not scheduled, try a new (unused) approved prompt
  IF selected_id IS NULL THEN
    SELECT id INTO selected_id
    FROM prompts
    WHERE status = 'approved' AND used_at IS NULL AND scheduled_for IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Step 4: If no new prompts, fall back to least recently used
  IF selected_id IS NULL THEN
    SELECT id INTO selected_id
    FROM prompts
    WHERE status = 'approved' AND scheduled_for IS NULL
    ORDER BY used_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  -- Step 5: Record selection and mark prompt as used
  IF selected_id IS NOT NULL THEN
    UPDATE prompts SET used_at = today WHERE id = selected_id;
    INSERT INTO daily_prompt (date, prompt_id) VALUES (today, selected_id);
    RETURN QUERY SELECT p.text FROM prompts p WHERE p.id = selected_id;
  END IF;

  -- No approved prompts available — return empty
  RETURN;
END;
$$;

-- Allow anonymous (unauthenticated) users to call the function
GRANT EXECUTE ON FUNCTION get_or_create_daily_prompt() TO anon, authenticated;
