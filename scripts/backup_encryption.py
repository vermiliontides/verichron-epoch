"""
FLAGGED FOR DELETION -- superseded, not currently useful.

Encrypts a directory into a fake "encrypted backup" using ad hoc PBKDF2/AES,
NOT Apple's real iOS backup encryption format. This was a stand-in for real
device backup encryption before Stage 0 (idevicebackup2, see
apps/epoch/src/tools/idevicebackup/) existed to do the real thing.

Not imported by anything outside scripts/ itself (only full_pipeline.py,
also flagged). No npm/uv script references it. Keeping it risks someone
mistaking its output for a real encrypted backup format, which it is not.

Recommend: delete, along with full_pipeline.py and backup_parser.py (the
rest of the same superseded synthetic-demo cluster).
"""
import os
import tarfile
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
import json
import io

class BackupEncryption:
    def __init__(self, password="test_password"):
        self.password = password.encode()
        self.salt = b'fake_salt_12345!'
        
    def _derive_key(self):
        """Derive encryption key from password"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=self.salt,
            iterations=1000,
        )
        return kdf.derive(self.password)
    
    def encrypt_backup(self, backup_dir, output_file):
        """Encrypt entire backup directory preserving structure"""
        print(f"Encrypting backup from {backup_dir}...")
        key = self._derive_key()
        iv = os.urandom(16)
        
        # Create tar archive in memory
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode='w') as tar:
            tar.add(backup_dir, arcname=Path(backup_dir).name)
        tar_data = tar_buffer.getvalue()
        
        # Encrypt tar data
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        encryptor = cipher.encryptor()
        
        # PKCS7 padding
        pad_len = 16 - (len(tar_data) % 16)
        tar_data += bytes([pad_len]) * pad_len
        
        encrypted_data = encryptor.update(tar_data) + encryptor.finalize()
        
        # Write IV + encrypted data
        with open(output_file, 'wb') as f:
            f.write(iv)
            f.write(encrypted_data)
        
        print(f"✓ Backup encrypted to {output_file}")
        
        metadata = {
            'salt': self.salt.hex(),
            'iterations': 1000,
            'algorithm': 'AES-256-CBC',
            'format': 'tar'
        }
        with open(f"{output_file}.meta", 'w') as f:
            json.dump(metadata, f)
    
    def decrypt_backup(self, encrypted_file, output_dir):
        """Decrypt backup and restore directory structure"""
        print(f"Decrypting backup from {encrypted_file}...")
        key = self._derive_key()
        
        with open(encrypted_file, 'rb') as f:
            iv = f.read(16)
            encrypted_data = f.read()
        
        # Decrypt
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        
        decrypted_data = decryptor.update(encrypted_data) + decryptor.finalize()
        
        # Remove PKCS7 padding
        pad_len = decrypted_data[-1]
        decrypted_data = decrypted_data[:-pad_len]
        
        # Extract tar
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        tar_buffer = io.BytesIO(decrypted_data)
        with tarfile.open(fileobj=tar_buffer, mode='r') as tar:
            tar.extractall(output_path)
        
        print(f"✓ Backup decrypted to {output_dir}")