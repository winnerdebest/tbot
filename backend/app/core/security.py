"""
security.py — Password hashing (Argon2), session token generation/hashing,
and AES-GCM symmetric encryption for user secrets (Groq API keys, Telegram sessions).
"""

import base64
import hashlib
import os
import secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(
        (token + ":" + settings.SESSION_SECRET).encode("utf-8")
    ).hexdigest()


def _derive_aes_key() -> bytes:
    """Derive a 256-bit AES key from ENCRYPTION_KEY."""
    return hashlib.sha256(settings.ENCRYPTION_KEY.encode("utf-8")).digest()


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret string using AES-256-GCM and return base64(nonce + ciphertext)."""
    if not plaintext:
        return ""
    aes = AESGCM(_derive_aes_key())
    nonce = os.urandom(12)
    ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt_secret(encoded: str | None) -> str:
    """Decrypt a base64(nonce + ciphertext) string encrypted with encrypt_secret."""
    if not encoded:
        return ""
    raw = base64.urlsafe_b64decode(encoded.encode("ascii"))
    nonce, ct = raw[:12], raw[12:]
    aes = AESGCM(_derive_aes_key())
    return aes.decrypt(nonce, ct, None).decode("utf-8")


def mask_api_key(key: str | None) -> str | None:
    if not key:
        return None
    if len(key) <= 8:
        return "••••" + key[-2:]
    return f"{key[:4]}••••{key[-4:]}"
