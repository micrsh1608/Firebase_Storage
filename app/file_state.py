"""Durable, bucket-scoped file lifecycle and named-recipient sharing metadata.

This database must be backed up with the bucket. Lock databases under .runtime
are disposable; this metadata is not. Account locks are always acquired before
opening a write transaction here, never while holding this database's lock.
"""
from contextlib import contextmanager
import hashlib
from pathlib import Path
import sqlite3
from threading import Lock


class FileState:
    def __init__(self, bucket_name, state_dir):
        self.directory = Path(state_dir)
        key = hashlib.sha256(bucket_name.encode()).hexdigest()
        self.path = self.directory / f"{key}.sqlite3"
        self._schema_ready = False
        self._schema_lock = Lock()

    def _ensure_schema(self, connection):
        with self._schema_lock:
            if self._schema_ready:
                return
            # The transaction serializes migration across processes too. Never
            # rename/drop phase-2 tables: existing trash and grants remain intact.
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute("CREATE TABLE IF NOT EXISTS files (owner_uid TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, trashed_at TEXT, display_name TEXT, folder_id TEXT, PRIMARY KEY(owner_uid,name))")
                columns = {row[1] for row in connection.execute("PRAGMA table_info(files)")}
                for column in ("display_name", "folder_id"):
                    if column not in columns:
                        connection.execute(f"ALTER TABLE files ADD COLUMN {column} TEXT")
                connection.execute("CREATE TABLE IF NOT EXISTS shares (owner_uid TEXT NOT NULL, name TEXT NOT NULL, recipient_uid TEXT NOT NULL, email TEXT NOT NULL, owner_email TEXT, created_at TEXT NOT NULL, PRIMARY KEY(owner_uid,name,recipient_uid))")
                connection.execute("CREATE INDEX IF NOT EXISTS shares_recipient ON shares(recipient_uid,owner_uid,name)")
                connection.execute("CREATE TABLE IF NOT EXISTS folders (owner_uid TEXT NOT NULL,id TEXT NOT NULL,parent_id TEXT,name TEXT NOT NULL,name_key TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(owner_uid,id))")
                connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS folder_siblings ON folders(owner_uid,COALESCE(parent_id,''),name_key)")
                connection.commit()
            except BaseException:
                connection.rollback()
                raise
            self._schema_ready = True

    @contextmanager
    def transaction(self, write=False):
        self.directory.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self.path), timeout=30, isolation_level=None)
        connection.row_factory = sqlite3.Row
        try:
            self._ensure_schema(connection)
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get(self, owner_uid, name):
        with self.transaction() as connection:
            row = connection.execute("SELECT status,trashed_at,display_name,folder_id FROM files WHERE owner_uid=? AND name=?", (owner_uid, name)).fetchone()
            return dict(row) if row is not None else {"status": "active", "trashed_at": None, "display_name": None, "folder_id": None}

    def owner_snapshot(self, owner_uid):
        with self.transaction() as connection:
            states = {row["name"]: dict(row) for row in connection.execute("SELECT name,status,trashed_at,display_name,folder_id FROM files WHERE owner_uid=?", (owner_uid,))}
            counts = {row["name"]: row["count"] for row in connection.execute("SELECT name,COUNT(*) AS count FROM shares WHERE owner_uid=? GROUP BY name", (owner_uid,))}
            return states, counts

    def set_metadata(self, owner_uid, name, display_name, folder_id):
        with self.transaction(write=True) as connection:
            connection.execute("INSERT INTO files(owner_uid,name,status,display_name,folder_id) VALUES(?,?,'active',?,?) ON CONFLICT(owner_uid,name) DO UPDATE SET display_name=excluded.display_name,folder_id=excluded.folder_id", (owner_uid, name, display_name, folder_id))

    def restore_private(self, owner_uid, name, folder_id):
        with self.transaction(write=True) as connection:
            connection.execute("UPDATE files SET status='active',trashed_at=NULL,folder_id=? WHERE owner_uid=? AND name=?", (folder_id, owner_uid, name))
            connection.execute("DELETE FROM shares WHERE owner_uid=? AND name=?", (owner_uid, name))

    def all_folders(self, owner_uid):
        with self.transaction() as connection:
            return {row["id"]: dict(row) for row in connection.execute("SELECT id,name,parent_id,created_at FROM folders WHERE owner_uid=?", (owner_uid,))}

    def create_folder(self, owner_uid, folder_id, name, parent_id, created_at):
        with self.transaction(write=True) as connection:
            connection.execute("INSERT INTO folders(owner_uid,id,name,name_key,parent_id,created_at) VALUES(?,?,?,?,?,?)", (owner_uid, folder_id, name, name.casefold(), parent_id, created_at))

    def update_folder(self, owner_uid, folder_id, name, parent_id):
        with self.transaction(write=True) as connection:
            connection.execute("UPDATE folders SET name=?,name_key=?,parent_id=? WHERE owner_uid=? AND id=?", (name, name.casefold(), parent_id, owner_uid, folder_id))

    def folder_has_files(self, owner_uid, folder_id):
        with self.transaction() as connection:
            return connection.execute("SELECT 1 FROM files WHERE owner_uid=? AND folder_id=? AND status!='purged' LIMIT 1", (owner_uid, folder_id)).fetchone() is not None

    def delete_folder(self, owner_uid, folder_id):
        with self.transaction(write=True) as connection:
            connection.execute("DELETE FROM folders WHERE owner_uid=? AND id=?", (owner_uid, folder_id))

    def set_status(self, owner_uid, name, status, trashed_at=None, clear_shares=False):
        with self.transaction(write=True) as connection:
            connection.execute("INSERT INTO files(owner_uid,name,status,trashed_at) VALUES(?,?,?,?) ON CONFLICT(owner_uid,name) DO UPDATE SET status=excluded.status,trashed_at=excluded.trashed_at", (owner_uid, name, status, trashed_at))
            if clear_shares:
                connection.execute("DELETE FROM shares WHERE owner_uid=? AND name=?", (owner_uid, name))

    def grants(self, owner_uid, name):
        with self.transaction() as connection:
            return [dict(row) for row in connection.execute("SELECT recipient_uid,email,created_at FROM shares WHERE owner_uid=? AND name=? ORDER BY created_at,recipient_uid", (owner_uid, name))]

    def recipient_grants(self, recipient_uid):
        with self.transaction() as connection:
            return [dict(row) for row in connection.execute("SELECT owner_uid,name,owner_email,created_at FROM shares WHERE recipient_uid=? ORDER BY owner_uid,name", (recipient_uid,))]

    def has_grant(self, owner_uid, name, recipient_uid):
        with self.transaction() as connection:
            return connection.execute("SELECT 1 FROM shares WHERE owner_uid=? AND name=? AND recipient_uid=?", (owner_uid, name, recipient_uid)).fetchone() is not None

    def add_grant(self, owner_uid, name, recipient_uid, email, owner_email, created_at):
        with self.transaction(write=True) as connection:
            connection.execute("INSERT INTO shares(owner_uid,name,recipient_uid,email,owner_email,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_uid,name,recipient_uid) DO UPDATE SET email=excluded.email,owner_email=excluded.owner_email", (owner_uid, name, recipient_uid, email, owner_email, created_at))
            row = connection.execute("SELECT recipient_uid,email,created_at FROM shares WHERE owner_uid=? AND name=? AND recipient_uid=?", (owner_uid, name, recipient_uid)).fetchone()
            return dict(row)

    def remove_grant(self, owner_uid, name, recipient_uid):
        with self.transaction(write=True) as connection:
            connection.execute("DELETE FROM shares WHERE owner_uid=? AND name=? AND recipient_uid=?", (owner_uid, name, recipient_uid))
