/**
 * Zod mirror of normalized-record.schema.json.
 *
 * The SourceType enum below is GENERATED from the canonical schema. All three
 * files are siblings in this same directory (packages/contracts/):
 *   - normalized-record.schema.json   (source of truth)
 *   - normalizedRecord.ts             (this file)
 *   - normalized_record.py            (Pydantic mirror)
 *
 * Do not add a source_type by hand here. Add it to the canonical schema and
 * run `python3 scripts/sync_contracts.py --write`; CI runs `--check` and
 * fails on drift.
 */
import { z } from "zod";
export declare const SourceType: z.ZodEnum<["crash_report", "siri_feedback", "sfa_analytics", "xp_amp_telemetry", "safari_history", "sms_attachment", "network_usage", "gcloud_log", "syslog_line", "mvt_ioc_detection", "timestamp_anomaly", "ileapp_record"]>;
export type SourceType = z.infer<typeof SourceType>;
export declare const NormalizedRecord: z.ZodObject<{
    incident_id: z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    source_type: z.ZodEnum<["crash_report", "siri_feedback", "sfa_analytics", "xp_amp_telemetry", "safari_history", "sms_attachment", "network_usage", "gcloud_log", "syslog_line", "mvt_ioc_detection", "timestamp_anomaly", "ileapp_record"]>;
    event_time: z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    bug_type: z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    process_name: z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    pid: z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    bundle_id: z.ZodDefault<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    fields: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strict", z.ZodTypeAny, {
    incident_id: string | null;
    source_type: "crash_report" | "siri_feedback" | "sfa_analytics" | "xp_amp_telemetry" | "safari_history" | "sms_attachment" | "network_usage" | "gcloud_log" | "syslog_line" | "mvt_ioc_detection" | "timestamp_anomaly" | "ileapp_record";
    event_time: string | null;
    bug_type: string | null;
    process_name: string | null;
    pid: number | null;
    bundle_id: string | null;
    fields: Record<string, unknown>;
}, {
    source_type: "crash_report" | "siri_feedback" | "sfa_analytics" | "xp_amp_telemetry" | "safari_history" | "sms_attachment" | "network_usage" | "gcloud_log" | "syslog_line" | "mvt_ioc_detection" | "timestamp_anomaly" | "ileapp_record";
    incident_id?: string | null | undefined;
    event_time?: string | null | undefined;
    bug_type?: string | null | undefined;
    process_name?: string | null | undefined;
    pid?: number | null | undefined;
    bundle_id?: string | null | undefined;
    fields?: Record<string, unknown> | undefined;
}>;
export type NormalizedRecord = z.infer<typeof NormalizedRecord>;
