#!/usr/bin/env python3

import getpass
import os
import re
import shutil
import subprocess
import sys
import tempfile
import warnings
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / "backups" / "neon"


def pgpass_escape(value):
    return value.replace("\\", "\\\\").replace(":", "\\:")


def run_checked(command, environment, sensitive_values=()):
    result = subprocess.run(command, env=environment, capture_output=True, text=True)
    if result.returncode != 0:
        error = result.stderr.strip()
        for value in sensitive_values:
            if value:
                error = error.replace(value, "[redacted]")
        raise RuntimeError(error or f"{Path(command[0]).name} failed with exit code {result.returncode}.")
    return result.stdout.strip()


def get_hidden_connection_url():
    if not sys.stdin.isatty():
        raise RuntimeError("Run this script in an interactive terminal that supports hidden input.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            return getpass.getpass("Paste the direct Neon connection URL (input hidden): ")
        except getpass.GetPassWarning:
            raise RuntimeError(
                "This terminal cannot hide pasted input; retry in a terminal that supports hidden input."
            ) from None


def main():
    for executable in ("pg_dump", "pg_restore", "psql"):
        if shutil.which(executable) is None:
            raise RuntimeError(f"{executable} is required. Install PostgreSQL client tools and retry.")

    connection_url = get_hidden_connection_url()
    parsed = urlsplit(connection_url)
    if parsed.scheme not in ("postgres", "postgresql") or not parsed.hostname:
        raise ValueError("Enter a valid PostgreSQL connection URL.")
    if not parsed.hostname.endswith(".neon.tech") or "pooler" in parsed.hostname:
        raise ValueError("Use the direct, unpooled connection URL from the intended Neon database.")
    if not parsed.username or not parsed.password or not parsed.path.strip("/"):
        raise ValueError("The connection URL must include a username, password, and database name.")

    options = parse_qs(parsed.query)
    sslmode = options.get("sslmode", ["require"])[0]
    if sslmode == "disable":
        raise ValueError("Neon connections must use SSL; sslmode=disable is not allowed.")

    host = parsed.hostname
    port = parsed.port or 5432
    username = unquote(parsed.username)
    password = unquote(parsed.password)
    database = unquote(parsed.path.lstrip("/"))
    sensitive_values = (connection_url, password, quote(password, safe=""))

    BACKUP_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    if BACKUP_DIR.stat().st_mode & 0o077:
        raise PermissionError(f"{BACKUP_DIR} is accessible by group or others; restrict its permissions before retrying.")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    backup_path = BACKUP_DIR / f"neon-{timestamp}.dump"
    if backup_path.exists():
        raise FileExistsError(f"Refusing to overwrite existing backup {backup_path.name}.")
    passfile_path = None
    backup_succeeded = False
    environment = os.environ.copy()
    for key in ("PGPASSWORD", "PGHOST", "PGPORT", "PGUSER", "PGDATABASE"):
        environment.pop(key, None)
    environment["PGSSLMODE"] = sslmode

    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", delete=False) as passfile:
            passfile_path = Path(passfile.name)
            os.chmod(passfile_path, 0o600)
            passfile.write(
                ":".join(
                    pgpass_escape(part)
                    for part in (host, str(port), database, username, password)
                )
                + "\n"
            )
        environment["PGPASSFILE"] = str(passfile_path)

        pg_dump_version = run_checked(["pg_dump", "--version"], environment)
        match = re.search(r"\b(\d+)(?:\.\d+)?\b", pg_dump_version)
        if not match:
            raise RuntimeError("Could not determine the installed pg_dump major version.")
        client_major = int(match.group(1))
        version_result = run_checked(
            [
                "psql",
                "--no-psqlrc",
                "--tuples-only",
                "--no-align",
                "--command",
                "SHOW server_version_num",
                "--host",
                host,
                "--port",
                str(port),
                "--username",
                username,
                "--dbname",
                database,
                "--no-password",
            ],
            environment,
            sensitive_values,
        )
        server_version_num = int(version_result)
        server_major = server_version_num // 10000 if server_version_num >= 100000 else 0
        if server_major and client_major < server_major:
            raise RuntimeError(
                f"pg_dump {client_major} is older than Neon PostgreSQL {server_major}; "
                "install a matching or newer PostgreSQL client and retry."
            )

        print(f"Using {pg_dump_version} with Neon PostgreSQL {server_major or 'pre-10'}.")
        run_checked(
            [
                "pg_dump",
                "--format=custom",
                "--no-owner",
                "--no-acl",
                "--no-password",
                "--host",
                host,
                "--port",
                str(port),
                "--username",
                username,
                "--dbname",
                database,
                "--file",
                str(backup_path),
            ],
            environment,
            sensitive_values,
        )
        if not backup_path.is_file() or backup_path.stat().st_size == 0:
            raise RuntimeError("pg_dump completed but the backup file is missing or empty.")

        archive_list = run_checked(
            ["pg_restore", "--list", str(backup_path)],
            environment,
            sensitive_values,
        )
        if not archive_list:
            raise RuntimeError("pg_restore could not read the backup archive contents.")

        run_checked(
            [
                "pg_restore",
                "--no-owner",
                "--no-acl",
                "--file",
                os.devnull,
                str(backup_path),
            ],
            environment,
            sensitive_values,
        )
        os.chmod(backup_path, 0o600)
        backup_succeeded = True
        print(f"Backup verified: {backup_path.relative_to(ROOT)} ({backup_path.stat().st_size} bytes).")
    finally:
        try:
            if not backup_succeeded and backup_path.exists():
                backup_path.unlink()
        finally:
            if passfile_path is not None:
                passfile_path.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Backup failed: {error}", file=sys.stderr)
        sys.exit(1)
