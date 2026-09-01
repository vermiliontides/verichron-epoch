"""
FLAGGED FOR DELETION -- superseded, not currently useful.

Hand-rolled parser for a raw iOS backup (reads Manifest.plist directly,
writes its own CSV/JSON output format). Superseded by the real extractor
apps under apps/extractors/ (crash, ileapp_bridge, mvt_iocs), which parse
real decrypted backups against the actual NormalizedRecord contract
(packages/contracts/normalized-record.schema.json) and write to Postgres
via db_writer.py -- this script predates that and writes to neither.

Not imported by anything outside scripts/ itself (only full_pipeline.py,
also flagged). No npm/uv script references it.

Recommend: delete, along with full_pipeline.py and backup_encryption.py
(the rest of the same superseded synthetic-demo cluster).
"""
import sqlite3
import json
import plistlib
from pathlib import Path
from datetime import datetime
import csv

class BackupParser:
    def __init__(self, backup_dir):
        self.backup_dir = Path(backup_dir)
        self.manifest = self._load_manifest()
        self.results_dir = self.backup_dir.parent / "results" / self.backup_dir.name
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.timeline_events = []
    
    def _load_manifest(self):
        manifest_path = self.backup_dir / 'Manifest.plist'
        with open(manifest_path, 'rb') as f:
            return plistlib.load(f)
    
    def _get_file_by_domain(self, domain, relative_path):
        """Find and extract file by domain and path"""
        for file_hash, info in self.manifest['Files'].items():
            if info['Domain'] == domain and info['RelativePath'] == relative_path:
                return self._extract_file(file_hash)
        return None
    
    def _extract_file(self, file_hash):
        """Extract file from backup by hash"""
        hex_dir = file_hash[:2]
        hex_file = file_hash[2:]
        file_path = self.backup_dir / hex_dir / hex_file
        
        if file_path.exists():
            return file_path.read_bytes()
        return None
    
    def _add_timeline_event(self, timestamp, event_type, description):
        """Add event to timeline"""
        if timestamp:
            self.timeline_events.append({
                'timestamp': timestamp,
                'datetime': datetime.fromtimestamp(timestamp).isoformat(),
                'type': event_type,
                'description': description
            })
    
    def parse_backup_info(self):
        """Parse backup metadata"""
        info_path = self.backup_dir / 'Info.plist'
        status_path = self.backup_dir / 'Status.plist'
        
        backup_info = {}
        
        if info_path.exists():
            with open(info_path, 'rb') as f:
                info_plist = plistlib.load(f)
                backup_info['device_name'] = info_plist.get('Device Name')
                backup_info['udid'] = info_plist.get('GUID')
                backup_info['imei'] = info_plist.get('IMEI')
                backup_info['iccid'] = info_plist.get('ICCID')
                
                if 'Lockdown' in info_plist:
                    lockdown = info_plist['Lockdown']
                    backup_info['product_type'] = lockdown.get('ProductType')
                    backup_info['product_version'] = lockdown.get('ProductVersion')
                    backup_info['build_version'] = lockdown.get('BuildVersion')
                    backup_info['serial_number'] = lockdown.get('SerialNumber')
        
        if status_path.exists():
            with open(status_path, 'rb') as f:
                status_plist = plistlib.load(f)
                backup_info['backup_date'] = status_plist.get('Date')
                backup_info['is_full_backup'] = status_plist.get('IsFullBackup')
                backup_info['version'] = status_plist.get('Version')
        
        output_file = self.results_dir / 'backup_info.json'
        with open(output_file, 'w') as f:
            json.dump(backup_info, f, indent=2, default=str)
        
        print(f"✓ Extracted backup info → {output_file.name}")
        return backup_info
    
    def parse_manifest(self):
        """Parse manifest into structured format"""
        manifest_data = {
            'total_files': len(self.manifest['Files']),
            'domains': {},
            'encrypted': self.manifest.get('IsEncrypted', False),
            'passcode_set': self.manifest.get('WasPasscodeSet', False)
        }
        
        for file_hash, info in self.manifest['Files'].items():
            domain = info['Domain']
            if domain not in manifest_data['domains']:
                manifest_data['domains'][domain] = {'count': 0, 'total_size': 0}
            manifest_data['domains'][domain]['count'] += 1
            manifest_data['domains'][domain]['total_size'] += info.get('Length', 0)
        
        output_file = self.results_dir / 'manifest.json'
        with open(output_file, 'w') as f:
            json.dump(manifest_data, f, indent=2, default=str)
        
        print(f"✓ Extracted manifest → {output_file.name}")
        return manifest_data
    
    def parse_contacts(self):
        """Extract contacts from AddressBook"""
        db_data = self._get_file_by_domain(
            'HomeDomain', 
            'Library/AddressBook/AddressBook.sqlitedb'
        )
        
        if not db_data:
            return []
        
        contacts = []
        db_path = Path('/tmp/AddressBook_parse.sqlitedb')
        db_path.write_bytes(db_data)
        
        try:
            conn = sqlite3.connect(str(db_path))
            c = conn.cursor()
            
            c.execute('''SELECT ROWID, First, Last FROM ABPerson''')
            for rowid, first, last in c.fetchall():
                contact = {
                    'id': rowid,
                    'first_name': first or '',
                    'last_name': last or ''
                }
                
                c.execute(
                    '''SELECT Value FROM ABMultiValue 
                       WHERE RecordID=? AND Property=3''',
                    (rowid,)
                )
                phones = [row[0] for row in c.fetchall()]
                contact['phones'] = phones
                
                c.execute(
                    '''SELECT Value FROM ABMultiValue 
                       WHERE RecordID=? AND Property=4''',
                    (rowid,)
                )
                emails = [row[0] for row in c.fetchall()]
                contact['emails'] = emails
                
                contacts.append(contact)
            
            conn.close()
        finally:
            db_path.unlink()
        
        output_file = self.results_dir / 'contacts.json'
        with open(output_file, 'w') as f:
            json.dump(contacts, f, indent=2, default=str)
        
        print(f"✓ Extracted {len(contacts)} contacts → {output_file.name}")
        return contacts
    
    def parse_messages(self):
        """Extract SMS messages"""
        db_data = self._get_file_by_domain(
            'HomeDomain',
            'Library/SMS/sms.db'
        )
        
        if not db_data:
            return []
        
        messages = []
        attachments = []
        db_path = Path('/tmp/sms_parse.db')
        db_path.write_bytes(db_data)
        
        try:
            conn = sqlite3.connect(str(db_path))
            c = conn.cursor()
            
            c.execute('''SELECT ROWID, address, text, date, type FROM message''')
            for rowid, address, text, timestamp, msg_type in c.fetchall():
                msg = {
                    'id': rowid,
                    'address': address or 'unknown',
                    'text': text or '',
                    'timestamp': timestamp or 0,
                    'type': 'sent' if msg_type == 1 else 'received',
                    'date': datetime.fromtimestamp(timestamp).isoformat() if timestamp else None
                }
                messages.append(msg)
                
                if timestamp:
                    self._add_timeline_event(timestamp, 'message', f"{msg_type}: {address[:20]}")
            
            conn.close()
        finally:
            db_path.unlink()
        
        sms_file = self.results_dir / 'sms.json'
        with open(sms_file, 'w') as f:
            json.dump(messages, f, indent=2, default=str)
        
        attach_file = self.results_dir / 'sms_attachments.json'
        with open(attach_file, 'w') as f:
            json.dump(attachments, f, indent=2, default=str)
        
        print(f"✓ Extracted {len(messages)} messages → {sms_file.name}")
        return messages
    
    def parse_calendar(self):
        """Extract calendar events"""
        db_data = self._get_file_by_domain(
            'HomeDomain',
            'Library/Calendar/calendar.sqlitedb'
        )
        
        if not db_data:
            return []
        
        events = []
        db_path = Path('/tmp/calendar_parse.sqlitedb')
        db_path.write_bytes(db_data)
        
        try:
            conn = sqlite3.connect(str(db_path))
            c = conn.cursor()
            
            c.execute('''SELECT ROWID, title, description, start_date, end_date, location 
                         FROM CalendarItem''')
            for rowid, title, desc, start, end, location in c.fetchall():
                event = {
                    'id': rowid,
                    'title': title or '',
                    'description': desc or '',
                    'start': datetime.fromtimestamp(start).isoformat() if start else None,
                    'end': datetime.fromtimestamp(end).isoformat() if end else None,
                    'location': location or ''
                }
                events.append(event)
                if start:
                    self._add_timeline_event(start, 'calendar', title or 'Event')
            
            conn.close()
        finally:
            db_path.unlink()
        
        output_file = self.results_dir / 'calendar.json'
        with open(output_file, 'w') as f:
            json.dump(events, f, indent=2, default=str)
        
        print(f"✓ Extracted {len(events)} calendar events → {output_file.name}")
        return events
    
    def parse_safari_history(self):
        """Extract Safari browsing history"""
        db_data = self._get_file_by_domain(
            'HomeDomain',
            'Library/Safari/History.db'
        )
        
        if not db_data:
            return []
        
        history = []
        db_path = Path('/tmp/History_parse.db')
        db_path.write_bytes(db_data)
        
        try:
            conn = sqlite3.connect(str(db_path))
            c = conn.cursor()
            
            c.execute('''SELECT id, url, title, visit_time FROM history_visits''')
            for vid, url, title, visit_time in c.fetchall():
                visit = {
                    'id': vid,
                    'url': url or '',
                    'title': title or '',
                    'timestamp': visit_time or 0,
                    'date': datetime.fromtimestamp(visit_time).isoformat() if visit_time else None
                }
                history.append(visit)
                if visit_time:
                    self._add_timeline_event(visit_time, 'safari_visit', url[:50] if url else 'visit')
            
            conn.close()
        finally:
            db_path.unlink()
        
        output_file = self.results_dir / 'safari_history.json'
        with open(output_file, 'w') as f:
            json.dump(history, f, indent=2, default=str)
        
        print(f"✓ Extracted {len(history)} Safari visits → {output_file.name}")
        return history
    
    def write_timeline_csv(self):
        """Write timeline as CSV"""
        self.timeline_events.sort(key=lambda x: x['timestamp'] or 0)
        
        output_file = self.results_dir / 'timeline.csv'
        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=['timestamp', 'datetime', 'type', 'description'])
            writer.writeheader()
            writer.writerows(self.timeline_events)
        
        print(f"✓ Wrote timeline with {len(self.timeline_events)} events → {output_file.name}")


    def parse_all(self):
        """Parse all extractable data"""
        print(f"Parsing {self.backup_dir.name}...\n")
        
        self.parse_backup_info()
        self.parse_manifest()
        self.parse_contacts()
        self.parse_messages()
        self.parse_calendar()
        self.parse_safari_history()
        self.write_timeline_csv()
        
        print(f"✓ All results in: {self.results_dir}\n")
