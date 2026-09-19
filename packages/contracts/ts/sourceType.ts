/**
 * Canonical source_type values for NormalizedRecord.
 * This is the single source of truth — never use raw string literals.
 *
 * Python equivalent: packages/contracts/py/source_type.py
 */
export const SourceType = {
  CRASH_REPORT:      'crash_report',
  ILEAPP_RECORD:     'ileapp_record',
  MVT_IOC_DETECTION: 'mvt_ioc_detection',
  SAFARI_HISTORY:    'safari_history',
  SMS_MESSAGE:       'sms_message',
  CALL_HISTORY:      'call_history',
  CONTACTS:          'contacts',
} as const

export type SourceType = typeof SourceType[keyof typeof SourceType]

/** Type guard */
export function isSourceType(value: string): value is SourceType {
  return Object.values(SourceType).includes(value as SourceType)
}