"""
Generates a realistic-shaped but entirely synthetic iPhone backup
(Contacts/Messages/Call Log/Calendar/Safari History SQLite databases,
Manifest.plist, Info.plist, Status.plist) under ./backups/<udid>/.

Why this exists: lets you exercise the real extractor apps
(apps/extractors/ileapp_bridge, apps/extractors/mvt_iocs) and the real
forensic_records pipeline against realistic data without a real device or
real PII. No real person's data appears anywhere in the output -- every
field is Faker-generated.

Does not encrypt or scan its own output -- for that, run the real
pipeline against it: idevicebackup2 (real device backup + encryption) is
Stage 0 in production, but for a synthetic backup you can skip straight
to mvt-runner's decrypt/scan step by pointing --source at a directory
containing this output, or feed it directly to an extractor's --backup-path.

Usage:
    python3 scripts/synthetic_backup_generator.py
    pnpm gen:synthetic-backup
"""
import sqlite3
import hashlib
import plistlib
from datetime import datetime, timedelta
from faker import Faker
import random
import os
from pathlib import Path
import json
from typing import List, Dict

fake = Faker()

class RealisticBackupGenerator:
    """Generate coordinated synthetic iPhone backup with encryption support"""
    
    def __init__(self, backup_dir, udid="00008140-00145CA91E83801C"):
        self.backup_dir = Path(backup_dir) / udid
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.udid = udid
        self.manifest_entries = {}
        self.backup_timestamp = int(datetime.now().timestamp())
        
        self.contacts = self._generate_contact_pool(count=25)
        self.phones = [c['phone'] for c in self.contacts]
        self.emails = [c['email'] for c in self.contacts]
        
    def _generate_contact_pool(self, count=25) -> List[Dict]:
        contacts = []
        for i in range(count):
            contacts.append({
                'first_name': fake.first_name(),
                'last_name': fake.last_name(),
                'phone': fake.phone_number(),
                'email': fake.email(),
                'id': i,
                'rowid': None
            })
        return contacts
    
    def path_to_hash(self, relative_path: str) -> str:
        return hashlib.sha1(relative_path.encode()).hexdigest()
    
    def add_file(self, domain: str, relative_path: str, content_bytes: bytes, file_size: int = None) -> str:
        file_hash = self.path_to_hash(f"{domain}-{relative_path}")
        hex_dir = file_hash[:2]
        hex_file = file_hash[2:]
        
        hex_path = self.backup_dir / hex_dir
        hex_path.mkdir(exist_ok=True)
        
        file_path = hex_path / hex_file
        file_path.write_bytes(content_bytes)
        
        self.manifest_entries[file_hash] = {
            'Domain': domain,
            'RelativePath': relative_path,
            'Flags': 1,
            'Length': file_size or len(content_bytes)
        }
        
        return file_hash
    
    def create_contacts_db(self):
        db_bytes = self._build_contacts_db()
        self.add_file('HomeDomain', 'Library/AddressBook/AddressBook.sqlitedb', db_bytes)
    
    def _build_contacts_db(self) -> bytes:
        db_path = Path('/tmp/AddressBook.sqlitedb')
        if db_path.exists():
            db_path.unlink()
        
        conn = sqlite3.connect(str(db_path))
        c = conn.cursor()
        
        c.execute('''CREATE TABLE ABPerson
                     (ROWID INTEGER PRIMARY KEY,
                      First TEXT,
                      Last TEXT,
                      Note TEXT,
                      CreationDate REAL,
                      ModificationDate REAL)''')
        
        c.execute('''CREATE TABLE ABMultiValue
                     (ROWID INTEGER PRIMARY KEY,
                      RecordID INTEGER,
                      Property INTEGER,
                      Value TEXT,
                      Label TEXT)''')
        
        now_ts = datetime.now().timestamp()
        
        for contact in self.contacts:
            created = now_ts - random.randint(86400*30, 86400*365)
            modified = created + random.randint(0, 86400*30)
            
            c.execute('''INSERT INTO ABPerson 
                         (First, Last, CreationDate, ModificationDate)
                         VALUES (?, ?, ?, ?)''',
                      (contact['first_name'], contact['last_name'], created, modified))
            contact['rowid'] = c.lastrowid
            
            c.execute('''INSERT INTO ABMultiValue 
                         (RecordID, Property, Value, Label)
                         VALUES (?, ?, ?, ?)''',
                      (contact['rowid'], 3, contact['phone'], 'iPhone'))
            
            c.execute('''INSERT INTO ABMultiValue 
                         (RecordID, Property, Value, Label)
                         VALUES (?, ?, ?, ?)''',
                      (contact['rowid'], 4, contact['email'], 'Home'))
        
        conn.commit()
        conn.close()
        
        content = db_path.read_bytes()
        db_path.unlink()
        return content
    
    def create_messages_db(self, message_count=250):
        db_bytes = self._build_messages_db(message_count)
        self.add_file('HomeDomain', 'Library/SMS/sms.db', db_bytes)
    
    def _build_messages_db(self, message_count=250) -> bytes:
        db_path = Path('/tmp/sms.db')
        if db_path.exists():
            db_path.unlink()
        
        conn = sqlite3.connect(str(db_path))
        c = conn.cursor()
        
        c.execute('''CREATE TABLE message
                     (ROWID INTEGER PRIMARY KEY,
                      address TEXT,
                      text TEXT,
                      date INTEGER,
                      type INTEGER,
                      flags INTEGER,
                      subject TEXT)''')
        
        c.execute('''CREATE TABLE attachment
                     (ROWID INTEGER PRIMARY KEY,
                      message_id INTEGER,
                      filename TEXT,
                      mime_type TEXT)''')
        
        now_ts = int(datetime.now().timestamp())
        msg_count = 0
        num_clusters = random.randint(5, 10)
        
        for _ in range(num_clusters):
            if msg_count >= message_count:
                break
            
            contact = random.choice(self.contacts)
            cluster_base = now_ts - random.randint(86400, 86400*60)
            conversation_msgs = random.randint(8, min(25, message_count - msg_count))
            
            for msg_idx in range(conversation_msgs):
                msg_time = cluster_base + random.randint(0, 14400)
                is_sent = random.choice([0, 1])
                
                c.execute('''INSERT INTO message
                             (address, text, date, type, flags, subject)
                             VALUES (?, ?, ?, ?, ?, ?)''',
                          (contact['phone'],
                           fake.sentence(nb_words=random.randint(3, 20)),
                           msg_time,
                           is_sent,
                           0,
                           ''))
                msg_id = c.lastrowid
                msg_count += 1
                
                if random.random() < 0.2:
                    c.execute('''INSERT INTO attachment
                                 (message_id, filename, mime_type)
                                 VALUES (?, ?, ?)''',
                              (msg_id,
                               f"IMG_{random.randint(1000, 9999)}.jpg",
                               "image/jpeg"))
        
        conn.commit()
        conn.close()
        
        content = db_path.read_bytes()
        db_path.unlink()
        return content
    
    def create_call_log(self, call_count=60):
        db_bytes = self._build_call_log(call_count)
        self.add_file('HomeDomain', 'Library/CallHistoryDB/CallHistory.storedata', db_bytes)
    
    def _build_call_log(self, call_count=60) -> bytes:
        db_path = Path('/tmp/CallHistory.storedata')
        if db_path.exists():
            db_path.unlink()
        
        conn = sqlite3.connect(str(db_path))
        c = conn.cursor()
        
        c.execute('''CREATE TABLE ZCALLRECORD
                     (Z_PK INTEGER PRIMARY KEY,
                      ZADDRESS TEXT,
                      ZDATE REAL,
                      ZDURATION REAL,
                      ZFLAGS INTEGER)''')
        
        now_ts = int(datetime.now().timestamp())
        ios_epoch_offset = 978307200
        
        for _ in range(call_count):
            contact = random.choice(self.contacts)
            call_time = now_ts - random.randint(0, 86400*90)
            ios_time = (call_time - ios_epoch_offset)
            duration = random.choice(
                [random.randint(30, 120),
                 random.randint(300, 1800),
                 random.randint(1800, 7200)]
            )
            
            c.execute('''INSERT INTO ZCALLRECORD
                         (ZADDRESS, ZDATE, ZDURATION, ZFLAGS)
                         VALUES (?, ?, ?, ?)''',
                      (contact['phone'],
                       ios_time,
                       duration,
                       random.choice([0, 1, 2, 4])))
        
        conn.commit()
        conn.close()
        
        content = db_path.read_bytes()
        db_path.unlink()
        return content
    
    def create_calendar_db(self, event_count=40):
        db_bytes = self._build_calendar_db(event_count)
        self.add_file('HomeDomain', 'Library/Calendar/calendar.sqlitedb', db_bytes)
    
    def _build_calendar_db(self, event_count=40) -> bytes:
        db_path = Path('/tmp/calendar.sqlitedb')
        if db_path.exists():
            db_path.unlink()
        
        conn = sqlite3.connect(str(db_path))
        c = conn.cursor()
        
        c.execute('''CREATE TABLE CalendarItem
                     (ROWID INTEGER PRIMARY KEY,
                      title TEXT,
                      description TEXT,
                      start_date REAL,
                      end_date REAL,
                      location TEXT)''')
        
        now_ts = datetime.now().timestamp()
        
        for _ in range(event_count):
            start = now_ts + random.randint(-86400*60, 86400*180)
            duration_hours = random.choice([0.5, 1, 2, 3, 8])
            end = start + (duration_hours * 3600)
            
            c.execute('''INSERT INTO CalendarItem
                         (title, description, start_date, end_date, location)
                         VALUES (?, ?, ?, ?, ?)''',
                      (fake.catch_phrase(),
                       fake.sentence(nb_words=8),
                       start,
                       end,
                       fake.city()))
        
        conn.commit()
        conn.close()
        
        content = db_path.read_bytes()
        db_path.unlink()
        return content
    
    def create_safari_history(self, visit_count=200):
        db_bytes = self._build_safari_db(visit_count)
        self.add_file('HomeDomain', 'Library/Safari/History.db', db_bytes)
    
    def _build_safari_db(self, visit_count=200) -> bytes:
        db_path = Path('/tmp/History.db')
        if db_path.exists():
            db_path.unlink()
        
        conn = sqlite3.connect(str(db_path))
        c = conn.cursor()
        
        c.execute('''CREATE TABLE history_visits
                     (id INTEGER PRIMARY KEY,
                      url TEXT,
                      title TEXT,
                      visit_time REAL,
                      visit_count INTEGER)''')
        
        now_ts = datetime.now().timestamp()
        
        for _ in range(visit_count):
            visit_time = now_ts - random.randint(0, 86400*30)
            
            c.execute('''INSERT INTO history_visits
                         (url, title, visit_time, visit_count)
                         VALUES (?, ?, ?, ?)''',
                      (fake.url(),
                       fake.sentence(nb_words=4),
                       visit_time,
                       random.randint(1, 5)))
        
        conn.commit()
        conn.close()
        
        content = db_path.read_bytes()
        db_path.unlink()
        return content
    
    def create_manifests(self):
        manifest = {
            'BackupKeyBag': b'',
            'Date': self.backup_timestamp,
            'IsEncrypted': False,
            'SystemDomainsVersion': 1,
            'WasPasscodeSet': False,
            'Files': self.manifest_entries
        }
        
        plist_path = self.backup_dir / 'Manifest.plist'
        with open(plist_path, 'wb') as f:
            plistlib.dump(manifest, f)
        
        db_path = self.backup_dir / 'Manifest.db'
        if db_path.exists():
            db_path.unlink()
        
        conn = sqlite3.connect(str(db_path))
        c = conn.cursor()
        
        c.execute('''CREATE TABLE Files
                     (fileID TEXT PRIMARY KEY,
                      domain TEXT,
                      relativePath TEXT,
                      flags INTEGER,
                      file_length INTEGER)''')
        
        for file_hash, info in self.manifest_entries.items():
            c.execute('''INSERT INTO Files
                         (fileID, domain, relativePath, flags, file_length)
                         VALUES (?, ?, ?, ?, ?)''',
                      (file_hash,
                       info['Domain'],
                       info['RelativePath'],
                       info['Flags'],
                       info['Length']))
        
        conn.commit()
        conn.close()
    
    def create_info_plist(self):
        info = {
            'Device Name': f"{fake.first_name()}'s iPhone",
            'GUID': self.udid,
            'ICCID': fake.bothify('##############'),
            'IMEI': fake.bothify('##############'),
            'IMSI': fake.bothify('##############'),
            'ISIN': fake.bothify('##############'),
            'Lockdown': {
                'BuildVersion': '18.0',
                'DeviceClass': 'iPhone',
                'ModelNumber': 'A3123',
                'ProductName': 'iPhone',
                'ProductType': 'iPhone15,3',
                'ProductVersion': '18.0',
                'SerialNumber': fake.bothify('?#?#?#?#?#?#?'),
                'UniqueBuildID': fake.sha256()
            }
        }
        
        plist_path = self.backup_dir / 'Info.plist'
        with open(plist_path, 'wb') as f:
            plistlib.dump(info, f)
    
    def create_status_plist(self):
        status = {
            'Date': datetime.now(),
            'IsFullBackup': True,
            'Version': 3
        }
        
        plist_path = self.backup_dir / 'Status.plist'
        with open(plist_path, 'wb') as f:
            plistlib.dump(status, f)
    
    def generate(self):
        """Create complete synthetic backup"""
        print(f"Generating backup at {self.backup_dir}...")
        
        self.create_contacts_db()
        print("✓ Created Contacts database")
        
        self.create_messages_db()
        print("✓ Created Messages database")
        
        self.create_call_log()
        print("✓ Created Call Log database")
        
        self.create_calendar_db()
        print("✓ Created Calendar database")
        
        self.create_safari_history()
        print("✓ Created Safari History database")

if __name__ == "__main__":
    generator = RealisticBackupGenerator('./backups')
    generator.generate()
    generator.create_manifests()
    generator.create_info_plist()
    generator.create_status_plist()
    print(f"\n✓ Backup generated at: ./backups/{generator.udid}")
