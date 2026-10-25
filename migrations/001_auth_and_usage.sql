BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(32) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT app_users_username_format CHECK (username ~ '^[a-z0-9][a-z0-9_-]{2,31}$')
);

CREATE INDEX IF NOT EXISTS app_users_active_idx ON app_users (is_active);

CREATE TABLE IF NOT EXISTS active_user_limit_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_users integer NOT NULL CHECK (active_users BETWEEN 0 AND 50)
);

LOCK TABLE app_users IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO active_user_limit_state (singleton, active_users)
SELECT true, count(*)::integer
FROM app_users
WHERE is_active = true
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_rate_limits (
  identifier_hash char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS login_rate_limits_window_started_idx
  ON login_rate_limits (window_started_at);

CREATE TABLE IF NOT EXISTS daily_usage (
  user_id uuid NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  successful_generations integer NOT NULL DEFAULT 0
    CHECK (successful_generations BETWEEN 0 AND 20),
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS app_bootstrap (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  completed_at timestamptz
);

INSERT INTO app_bootstrap (singleton, completed_at)
VALUES (true, NULL)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION enforce_active_user_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active IS TRUE THEN
      UPDATE active_user_limit_state
      SET active_users = active_users + 1
      WHERE singleton = true AND active_users < 50;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Maximum of 50 active accounts reached.'
          USING ERRCODE = '23514', CONSTRAINT = 'active_user_limit';
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_active IS TRUE THEN
      UPDATE active_user_limit_state
      SET active_users = active_users - 1
      WHERE singleton = true AND active_users > 0;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Active user limit counter is inconsistent.'
          USING ERRCODE = '23514', CONSTRAINT = 'active_user_limit';
      END IF;
    END IF;
    RETURN OLD;
  ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    IF NEW.is_active IS TRUE THEN
      UPDATE active_user_limit_state
      SET active_users = active_users + 1
      WHERE singleton = true AND active_users < 50;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Maximum of 50 active accounts reached.'
          USING ERRCODE = '23514', CONSTRAINT = 'active_user_limit';
      END IF;
    ELSE
      UPDATE active_user_limit_state
      SET active_users = active_users - 1
      WHERE singleton = true AND active_users > 0;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Active user limit counter is inconsistent.'
          USING ERRCODE = '23514', CONSTRAINT = 'active_user_limit';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_active_limit_trigger ON app_users;
CREATE TRIGGER app_users_active_limit_trigger
BEFORE INSERT OR UPDATE OF is_active OR DELETE ON app_users
FOR EACH ROW EXECUTE FUNCTION enforce_active_user_limit();

COMMIT;
