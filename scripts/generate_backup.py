from synthetic_backup_generator import RealisticBackupGenerator

# Generate unencrypted backup
generator = RealisticBackupGenerator('./backups')
generator.generate()
generator.create_manifests()
generator.create_info_plist()
generator.create_status_plist()

print(f"\n✓ Backup generated at: ./backups/{generator.udid}")