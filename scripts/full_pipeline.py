"""
FLAGGED FOR DELETION -- superseded, not currently useful.

Orchestrates the old synthetic demo flow end to end: generate a fake
backup (synthetic_backup_generator.py) -> fake-encrypt it
(backup_encryption.py) -> hand-parse it (backup_parser.py). All three
downstream pieces are separately flagged for deletion; this is their
entry point.

Conceptually replaced by the real pipeline: idevicebackup2 (Stage 0, real
device backup + encryption) -> mvt-runner (Stage 1, real decrypt + scan)
-> orchestrator (Stage 3, real extractors writing to Postgres). Not
referenced by any current npm/uv script. scripts/smoke_test.sh points at
this file via a path that no longer exists
(scripts/synthetic_backup_pipeline/full_pipeline.py) -- it's also flagged.

Recommend: delete, along with backup_encryption.py, backup_parser.py, and
smoke_test.sh.
"""
import sys
sys.path.insert(0, './scripts')

from synthetic_backup_generator import RealisticBackupGenerator
from backup_encryption import BackupEncryption
from backup_parser import BackupParser
from pathlib import Path

# Step 1: Generate
print("=" * 60)
print("STEP 1: Generate Synthetic Backup")
print("=" * 60)
generator = RealisticBackupGenerator('./backups')
generator.generate()
generator.create_manifests()
generator.create_info_plist()
generator.create_status_plist()
backup_path = generator.backup_dir
print(f"✓ Backup created at: {backup_path}\n")

# Step 2: Encrypt
print("=" * 60)
print("STEP 2: Encrypt Backup")
print("=" * 60)
encryptor = BackupEncryption()
encrypted_file = "./backups/encrypted_backup.bin"
encryptor.encrypt_backup(str(backup_path), encrypted_file)
print()

# Step 3: Decrypt
print("=" * 60)
print("STEP 3: Decrypt Backup")
print("=" * 60)
decryptor = BackupEncryption()
decryptor.decrypt_backup(encrypted_file, "./backups/decrypted")
print()

# Step 4: Parse original backup
print("=" * 60)
print("STEP 4: Parse Original Backup")
print("=" * 60)
parser = BackupParser(str(backup_path))
parser.parse_all()
print()

# Step 5: Parse decrypted backup
print("=" * 60)
print("STEP 5: Parse Decrypted Backup")
print("=" * 60)
decrypted_backup_path = Path('./backups/decrypted') / backup_path.name
parser_decrypted = BackupParser(str(decrypted_backup_path))
parser_decrypted.parse_all()
print()

# Step 6: Show results
print("=" * 60)
print("STEP 6: Results Structure")
print("=" * 60)
results_dir = backup_path.parent / "results" / backup_path.name
print(f"\nOriginal backup results:")
for json_file in sorted(results_dir.glob("*.json")):
    print(f"  ✓ {json_file.name}")

decrypted_results = decrypted_backup_path.parent / "results" / decrypted_backup_path.name
print(f"\nDecrypted backup results:")
for json_file in sorted(decrypted_results.glob("*.json")):
    print(f"  ✓ {json_file.name}")

print("\nDone!")
