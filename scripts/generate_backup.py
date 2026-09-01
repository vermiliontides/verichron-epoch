"""
FLAGGED FOR DELETION -- redundant, superseded by a fix to its own dependency.

This script's entire job (call RealisticBackupGenerator's four setup
methods and print the result) is now built directly into
synthetic_backup_generator.py's own `if __name__ == "__main__"` block,
which previously didn't exist. Run that file directly instead:

    python3 scripts/synthetic_backup_generator.py
    pnpm gen:synthetic-backup

Recommend: delete.
"""
from synthetic_backup_generator import RealisticBackupGenerator

# Generate unencrypted backup
generator = RealisticBackupGenerator('./backups')
generator.generate()
generator.create_manifests()
generator.create_info_plist()
generator.create_status_plist()

print(f"\n✓ Backup generated at: ./backups/{generator.udid}")
