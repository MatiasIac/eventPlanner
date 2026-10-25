ALTER TABLE wedding ADD COLUMN theme text NOT NULL DEFAULT 'beach'
  CHECK (theme IN ('beach','night','garden','sunset','lavender'));
-- Existing descriptions remain untouched and render as plain text until edited.
ALTER TABLE activities ADD COLUMN description_content jsonb;
