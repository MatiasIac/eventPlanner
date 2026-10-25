ALTER TABLE wedding ADD COLUMN schedule_revision integer NOT NULL DEFAULT 1;
ALTER TABLE activities ADD COLUMN duration_minutes integer NOT NULL DEFAULT 15 CHECK (duration_minutes BETWEEN 1 AND 1440);
ALTER TABLE activities ADD COLUMN duration_estimated boolean NOT NULL DEFAULT false;
ALTER TABLE activities ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed'));
ALTER TABLE activities ADD COLUMN confirmed_by uuid REFERENCES participants;
ALTER TABLE activities ADD COLUMN confirmed_at timestamptz;

-- Keep every existing start time. Where no end was supplied, use the gap to
-- the next distinct start as an explicitly labelled, editable estimate.
WITH durations AS (
  SELECT a.id, CASE WHEN a.end_time IS NOT NULL THEN
    ((a.end_day_offset-a.day_offset)*1440 + extract(epoch FROM (a.end_time-a.start_time))/60)::integer
  ELSE (SELECT min((b.day_offset-a.day_offset)*1440 + extract(epoch FROM (b.start_time-a.start_time))/60)::integer
    FROM activities b WHERE NOT b.archived AND b.start_time IS NOT NULL
      AND (b.day_offset,b.start_time)>(a.day_offset,a.start_time)) END AS minutes
  FROM activities a
)
UPDATE activities a SET duration_minutes=greatest(1,least(1440,coalesce(d.minutes,15))),
  duration_estimated=(a.end_time IS NULL), status='confirmed'
FROM durations d WHERE a.id=d.id;

WITH ordering AS (
  SELECT id,row_number() OVER (ORDER BY archived,start_time IS NULL,day_offset,start_time,sort_order,id) AS position
  FROM activities
)
UPDATE activities a SET sort_order=o.position FROM ordering o WHERE a.id=o.id;
