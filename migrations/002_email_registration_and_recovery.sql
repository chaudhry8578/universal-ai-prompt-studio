BEGIN;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS email_identity text GENERATED ALWAYS AS (
    CASE
      WHEN email IS NULL THEN NULL
      ELSE replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_disabled_at timestamptz;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_gmail_email_format' AND conrelid = 'app_users'::regclass) THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_gmail_email_format
      CHECK (
        email IS NULL OR (
          email = lower(btrim(email))
          AND email ~ '^[a-z0-9][a-z0-9.+]*@gmail\.com$'
          AND position('..' IN split_part(email, '@', 1)) = 0
          AND right(split_part(email, '@', 1), 1) <> '.'
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_email_identity_pair' AND conrelid = 'app_users'::regclass) THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_email_identity_pair
      CHECK ((email IS NULL) = (email_identity IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_email_identity_format' AND conrelid = 'app_users'::regclass) THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_email_identity_format
      CHECK (email_identity IS NULL OR email_identity ~ '^[a-z0-9]+@gmail\.com$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_verified_email_present' AND conrelid = 'app_users'::regclass) THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_verified_email_present
      CHECK (email_verified_at IS NULL OR email IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_users_admin_disabled_inactive' AND conrelid = 'app_users'::regclass) THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_admin_disabled_inactive
      CHECK (admin_disabled_at IS NULL OR is_active = false);
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_identity_idx
  ON app_users (email_identity)
  WHERE email_identity IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash char(64) NOT NULL UNIQUE
    CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid REFERENCES app_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by_user_id uuid REFERENCES app_users (id) ON DELETE CASCADE,
  CONSTRAINT auth_access_codes_expiry CHECK (expires_at > created_at),
  CONSTRAINT auth_access_codes_redemption_pair
    CHECK ((redeemed_at IS NULL) = (redeemed_by_user_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_access_codes_redeemed_user_idx
  ON auth_access_codes (redeemed_by_user_id)
  WHERE redeemed_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS auth_access_codes_created_at_idx
  ON auth_access_codes (created_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash char(64) PRIMARY KEY
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT email_verification_tokens_expiry CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_one_pending_per_user_idx
  ON email_verification_tokens (user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS email_verification_tokens_expiry_idx
  ON email_verification_tokens (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash char(64) PRIMARY KEY
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT password_reset_tokens_expiry CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_one_pending_per_user_idx
  ON password_reset_tokens (user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS password_reset_tokens_expiry_idx
  ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS auth_action_rate_limits (
  action text NOT NULL CHECK (action IN ('register', 'verify-email', 'forgot-password', 'reset-password', 'enroll-email')),
  subject_hash char(64) NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (action, subject_hash)
);

CREATE INDEX IF NOT EXISTS auth_action_rate_limits_window_idx
  ON auth_action_rate_limits (window_started_at);

COMMIT;
