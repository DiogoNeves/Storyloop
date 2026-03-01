from __future__ import annotations

import pytest

from app.utils.encryption import (
    decrypt_value,
    decrypt_value_or_plaintext,
    encrypt_value,
    init_encryption,
)


@pytest.fixture(autouse=True)
def _init_encryption() -> None:
    """Ensure the encryption subsystem is initialized for every test."""
    init_encryption(None)


class TestEncryptDecryptRoundtrip:
    def test_roundtrip_preserves_value(self) -> None:
        plaintext = "sk-test-key-abc123"
        ciphertext = encrypt_value(plaintext)
        assert ciphertext != plaintext
        assert decrypt_value(ciphertext) == plaintext

    def test_ciphertext_differs_across_calls(self) -> None:
        """Fernet includes a timestamp, so two encryptions of the same value differ."""
        plaintext = "sk-test"
        a = encrypt_value(plaintext)
        b = encrypt_value(plaintext)
        assert a != b
        assert decrypt_value(a) == plaintext
        assert decrypt_value(b) == plaintext


class TestDecryptValueOrPlaintext:
    def test_decrypts_encrypted_value(self) -> None:
        plaintext = "sk-secret"
        ciphertext = encrypt_value(plaintext)
        assert decrypt_value_or_plaintext(ciphertext) == plaintext

    def test_returns_plaintext_unchanged(self) -> None:
        """Legacy plaintext keys are returned as-is (migration case)."""
        plaintext = "sk-already-plaintext"
        assert decrypt_value_or_plaintext(plaintext) == plaintext

    def test_returns_empty_string_unchanged(self) -> None:
        assert decrypt_value_or_plaintext("") == ""

    def test_returns_arbitrary_string_unchanged(self) -> None:
        assert decrypt_value_or_plaintext("not-a-fernet-token") == "not-a-fernet-token"
