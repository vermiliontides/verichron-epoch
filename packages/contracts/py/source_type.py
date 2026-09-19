"""
Canonical source_type values for NormalizedRecord.
This is the single source of truth — never use raw string literals.

TypeScript equivalent: packages/contracts/ts/sourceType.ts
"""
from enum import StrEnum


class SourceType(StrEnum):
    CRASH_REPORT       = "crash_report"
    ILEAPP_RECORD      = "ileapp_record"
    MVT_IOC_DETECTION  = "mvt_ioc_detection"
    SAFARI_HISTORY     = "safari_history"
    SMS_MESSAGE        = "sms_message"
    CALL_HISTORY       = "call_history"
    CONTACTS           = "contacts"


def is_source_type(value: str) -> bool:
    return value in SourceType._value2member_map_