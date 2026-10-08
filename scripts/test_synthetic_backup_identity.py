"""The synthetic backup must identify its device the way a real iTunes/Finder
backup does, or the orchestrator's pre-flight registration (EPOCH-404) refuses
it: the UDID is "Unique Identifier" / "Target Identifier", and "GUID" is a
separate iTunes backup GUID that must never be read as the device identity.
"""

import plistlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backup_parser import BackupParser  # noqa: E402
from synthetic_backup_generator import RealisticBackupGenerator  # noqa: E402

UDID = "00008140-00145ca91e83801c"


def test_generated_info_plist_carries_the_udid_where_registration_reads_it(tmp_path):
    generator = RealisticBackupGenerator(tmp_path, udid=UDID)
    generator.create_info_plist()
    with open(generator.backup_dir / "Info.plist", "rb") as f:
        info = plistlib.load(f)

    assert info["Unique Identifier"] == UDID.upper()
    assert info["Target Identifier"] == UDID.upper()
    assert info["GUID"].upper() != UDID.upper().replace("-", ""), "GUID is not the UDID"


def test_backup_parser_reads_the_udid_not_the_guid(tmp_path):
    generator = RealisticBackupGenerator(tmp_path, udid=UDID)
    generator.create_info_plist()
    generator.create_status_plist()
    generator.create_manifests()
    info = BackupParser(generator.backup_dir).parse_backup_info()
    assert info["udid"] == UDID.upper()
