"""Symmetric encryption utilities for API keys at rest."""

from __future__ import annotations

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_DEV_PASSPHRASE = b"storyloop-dev-encryption-key-not-for-production"
_DEV_KEY = base64.urlsafe_b64encode(hashlib.sha256(_DEV_PASSPHRASE).digest())

_fernet_instance: Fernet | None = None


def init_encryption(encryption_key: str | None) -> None:
    """Initialize the encryption subsystem. Call once at startup."""
    global _fernet_instance  # noqa: PLW0603

    if encryption_key:
        key_bytes = encryption_key.encode()
    else:
        logger.warning(
            "ENCRYPTION_KEY is not set. Using a deterministic development key. "
            "Set ENCRYPTION_KEY in production for secure encryption."
        )
        key_bytes = _DEV_KEY

    _fernet_instance = Fernet(key_bytes)


def _get_fernet() -> Fernet:
    if _fernet_instance is None:
        raise RuntimeError(
            "Encryption not initialized. Call init_encryption() at startup."
        )
    return _fernet_instance


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string, returning the ciphertext as UTF-8."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string, returning the original plaintext."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def decrypt_value_or_plaintext(value: str) -> str:
    """Attempt decryption; return the value unchanged if it is not encrypted.

    Handles the migration case where existing rows store plaintext keys.
    """
    try:
        return decrypt_value(value)
    except (InvalidToken, Exception):
        return value
