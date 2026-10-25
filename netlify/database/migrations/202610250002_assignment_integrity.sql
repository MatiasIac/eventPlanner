ALTER TABLE assignments DROP CONSTRAINT assignments_check;
ALTER TABLE assignments ADD CONSTRAINT assignment_identity CHECK (
  (participant_id IS NOT NULL AND nominee_name IS NULL AND manager_id = participant_id)
  OR (participant_id IS NULL AND nominee_name IS NOT NULL AND length(nominee_name) > 0)
);
