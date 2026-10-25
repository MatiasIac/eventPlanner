ALTER TABLE wedding ADD COLUMN start_time time NOT NULL DEFAULT '14:00';
ALTER TABLE activities DROP CONSTRAINT activities_day_offset_check;
ALTER TABLE activities DROP CONSTRAINT activities_end_day_offset_check;
ALTER TABLE activities ADD CONSTRAINT activities_day_offset_check CHECK (day_offset BETWEEN -365 AND 365);
ALTER TABLE activities ADD CONSTRAINT activities_end_day_offset_check CHECK (end_day_offset BETWEEN -365 AND 365);
ALTER TABLE activities ADD COLUMN plan_day smallint NOT NULL DEFAULT 0 CHECK (plan_day BETWEEN -365 AND 365);
ALTER TABLE activities ADD COLUMN timing_mode text NOT NULL DEFAULT 'linked' CHECK (timing_mode IN ('linked','fixed'));
UPDATE activities SET plan_day=day_offset;
