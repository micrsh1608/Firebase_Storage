"""Legacy public-token migration behavior against an isolated fake bucket."""
from copy import deepcopy

from google.api_core.exceptions import PreconditionFailed

from scripts.revoke_legacy_tokens import revoke_legacy_tokens


TOKEN_KEY = "firebaseStorageDownloadTokens"
SECRET = "legacy-token-that-must-not-be-logged"


class Blob:
    def __init__(self, name, metadata=None, *, metageneration=7, failure=None):
        self.name = name
        self.metadata = deepcopy(metadata)
        self.metageneration = metageneration
        self.cache_control = "private, max-age=0, no-store"
        self.failure = failure
        self.calls = []

    def patch(self, *, if_metageneration_match, timeout):
        self.calls.append({"generation": if_metageneration_match, "timeout": timeout,
                           "metadata": deepcopy(self.metadata)})
        assert if_metageneration_match == self.metageneration
        assert timeout == 30
        if self.failure is not None:
            raise self.failure
        self.metadata = {key: value for key, value in self.metadata.items() if value is not None}
        self.metageneration += 1


class Bucket:
    def __init__(self, *blobs):
        self.blobs = list(blobs)
        self.calls = []

    def list_blobs(self, *, prefix, timeout):
        self.calls.append((prefix, timeout))
        return [blob for blob in self.blobs if blob.name.startswith(prefix)]


def counts(*, scanned, matched, revoked=0, conflicts=0, failed=0):
    return dict(scanned=scanned, matched=matched, revoked=revoked, conflicts=conflicts, failed=failed)


def test_dry_run_counts_legacy_objects_without_writes_or_metadata_changes(capsys):
    legacy = Blob("users/alice/legacy.pdf", {TOKEN_KEY: SECRET, "originalName": "bài tập.pdf"})
    private = Blob("users/bob/private.pdf", {"originalName": "private.pdf"})
    empty = Blob("users/bob/empty-metadata.pdf", None)
    outside = Blob("public/not-an-account.pdf", {TOKEN_KEY: SECRET})
    original = deepcopy(legacy.metadata)
    bucket = Bucket(legacy, private, empty, outside)
    result = revoke_legacy_tokens(bucket)
    assert result == counts(scanned=3, matched=1)
    assert bucket.calls == [("users/", 30)]
    assert legacy.metadata == original
    assert outside.metadata == {TOKEN_KEY: SECRET}
    assert not any(blob.calls for blob in bucket.blobs)
    output = capsys.readouterr()
    assert SECRET not in output.out + output.err + str(result)


def test_apply_removes_only_download_token_with_generation_guard():
    original = {TOKEN_KEY: SECRET, "originalName": "bài tập.pdf", "ownerNote": "keep", "otherToken": "unrelated"}
    legacy = Blob("users/alice/legacy.pdf", original)
    bucket = Bucket(legacy)
    result = revoke_legacy_tokens(bucket, apply=True)
    expected = {key: value for key, value in original.items() if key != TOKEN_KEY}
    assert result == counts(scanned=1, matched=1, revoked=1)
    assert legacy.metadata == expected
    submitted = {**expected, TOKEN_KEY: None}
    assert legacy.calls == [{"generation": 7, "timeout": 30, "metadata": submitted}]
    assert legacy.cache_control == "private, max-age=0, no-store"


def test_apply_is_idempotent_and_private_objects_are_untouched():
    legacy = Blob("users/alice/legacy.pdf", {TOKEN_KEY: SECRET})
    private = Blob("users/alice/private.pdf", {"originalName": "private.pdf"})
    bucket = Bucket(legacy, private)
    assert revoke_legacy_tokens(bucket, apply=True) == counts(scanned=2, matched=1, revoked=1)
    assert revoke_legacy_tokens(bucket, apply=True) == counts(scanned=2, matched=0)
    assert legacy.metadata == {}
    assert len(legacy.calls) == 1
    assert not private.calls and private.metadata == {"originalName": "private.pdf"}


def test_conflict_is_counted_without_overwriting_newer_metadata_or_leaking_token(capsys):
    legacy = Blob("users/alice/legacy.pdf", {TOKEN_KEY: SECRET, "note": "keep"},
                  failure=PreconditionFailed("sensitive-upstream-detail " + SECRET))
    original = deepcopy(legacy.metadata)
    result = revoke_legacy_tokens(Bucket(legacy), apply=True)
    assert result == counts(scanned=1, matched=1, conflicts=1)
    assert len(legacy.calls) == 1 and legacy.calls[0]["generation"] == 7
    assert legacy.metadata == original
    output = capsys.readouterr()
    assert SECRET not in output.out + output.err + str(result)


def test_upstream_failure_is_counted_and_local_metadata_restored(capsys):
    legacy = Blob("users/alice/legacy.pdf", {TOKEN_KEY: SECRET, "note": "keep"},
                  failure=RuntimeError("sensitive-credential-path " + SECRET))
    original = deepcopy(legacy.metadata)
    result = revoke_legacy_tokens(Bucket(legacy), apply=True)
    assert result == counts(scanned=1, matched=1, failed=1)
    assert legacy.metadata == original
    output = capsys.readouterr()
    assert SECRET not in output.out + output.err + str(result)


def test_missing_generation_refuses_unconditional_metadata_patch():
    legacy = Blob("users/alice/legacy.pdf", {TOKEN_KEY: SECRET, "note": "keep"}, metageneration=None)
    original = deepcopy(legacy.metadata)
    assert revoke_legacy_tokens(Bucket(legacy), apply=True) == counts(scanned=1, matched=1, failed=1)
    assert not legacy.calls
    assert legacy.metadata == original

