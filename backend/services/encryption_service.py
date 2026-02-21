"""
Encryption service - AES-256 encryption for backup files.
"""
import os
import hashlib
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend


class EncryptionService:
    """Handles backup file encryption/decryption using AES-256-GCM."""

    CHUNK_SIZE = 64 * 1024  # 64KB chunks
    SALT_SIZE = 16
    NONCE_SIZE = 12
    TAG_SIZE = 16

    @staticmethod
    def derive_key(password: str, salt: bytes) -> bytes:
        """Derive a 256-bit key from password using PBKDF2."""
        return hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt,
            iterations=100000,
            dklen=32
        )

    @classmethod
    def encrypt_file(cls, input_path: Path, output_path: Path, password: str):
        """
        Encrypt a file using AES-256-GCM.

        File format:
        - 16 bytes: salt
        - 12 bytes: nonce
        - remaining: encrypted data + 16 byte tag
        """
        # Generate salt and nonce
        salt = os.urandom(cls.SALT_SIZE)
        nonce = os.urandom(cls.NONCE_SIZE)

        # Derive key
        key = cls.derive_key(password, salt)

        # Create cipher
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(nonce),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()

        with open(input_path, 'rb') as infile, open(output_path, 'wb') as outfile:
            # Write salt and nonce
            outfile.write(salt)
            outfile.write(nonce)

            # Encrypt file in chunks
            while True:
                chunk = infile.read(cls.CHUNK_SIZE)
                if not chunk:
                    break
                outfile.write(encryptor.update(chunk))

            # Finalize and write tag
            outfile.write(encryptor.finalize())
            outfile.write(encryptor.tag)

    @classmethod
    def decrypt_file(cls, input_path: Path, output_path: Path, password: str):
        """
        Decrypt a file encrypted with AES-256-GCM.
        """
        with open(input_path, 'rb') as infile:
            # Read salt and nonce
            salt = infile.read(cls.SALT_SIZE)
            nonce = infile.read(cls.NONCE_SIZE)

            # Read the rest (encrypted data + tag)
            encrypted_data = infile.read()

        # Extract tag from end
        tag = encrypted_data[-cls.TAG_SIZE:]
        encrypted_data = encrypted_data[:-cls.TAG_SIZE]

        # Derive key
        key = cls.derive_key(password, salt)

        # Create cipher
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(nonce, tag),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()

        # Decrypt and write
        with open(output_path, 'wb') as outfile:
            outfile.write(decryptor.update(encrypted_data))
            outfile.write(decryptor.finalize())

    @classmethod
    def generate_key(cls) -> str:
        """Generate a random encryption key (base64 encoded)."""
        import base64
        return base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8')

    @classmethod
    def validate_key(cls, key: str) -> bool:
        """Validate that a key is properly formatted."""
        if not key or len(key) < 16:
            return False
        return True
