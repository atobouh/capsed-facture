-- A code can be retried by the computer that used it (its reply may have been lost on a bad connection):
-- the same attempt id gets the same computer back, with a fresh token. Anyone else still gets "code unknown".
ALTER TABLE device_codes ADD COLUMN attempt_hash TEXT;
ALTER TABLE device_codes ADD COLUMN device_id TEXT;
