import { z } from "zod";

export const LATEST_SCHEMA_VERSION = "0.4.0";
export const LATEST_WEB_VIEWER_VERSION = "0.4.0";
export const EDITOR_NAME = "VS Code";

//
// AUTO PUSH
//
export const AutoPushRecordSchema = z.object({
    year: z.string().default(""),
    month: z.string().default(""),
    week: z.string().default(""),
    day: z.string().default(""),
});
export type AutoPushRecord = z.infer<typeof AutoPushRecordSchema>;

//
// WEB RECORD
//
const WebViewerVersionSchema = z.string().default(LATEST_WEB_VIEWER_VERSION);

export const WebViewerRecordSchema = z.object({
    version: WebViewerVersionSchema,
});
export type WebViewerRecord = z.infer<typeof WebViewerRecordSchema>;

//
// CODERANK STATS
//
const VersionSchema = z.string().default(LATEST_SCHEMA_VERSION);

export const CharMapValueSchema = z.object({
    added: z.number().default(0),
    added_typed: z.number().default(0),
    added_pasted: z.number().default(0),
});
export type CharMapValue = z.infer<typeof CharMapValueSchema>;

export const CharMapSchema = z.record(CharMapValueSchema).default({});
export type CharMap = z.infer<typeof CharMapSchema>;

export const MainStatsSchema = z.object({
    rank: z.number().default(0),
    added: z.number().default(0),
    added_typed: z.number().default(0),
    added_pasted: z.number().default(0),
    num_pastes: z.number().default(0),
    deleted: z.number().default(0),
    deleted_typed: z.number().default(0),
    deleted_cut: z.number().default(0),
    num_cuts: z.number().default(0),
    chars: CharMapSchema,
});
export type MainStats = z.infer<typeof MainStatsSchema>;

export const LangMapSchema = z.record(MainStatsSchema).default({});
export type LangMap = z.infer<typeof LangMapSchema>;

export const CoderankBufferSchema = z.object({
    languages: LangMapSchema,
});
export type CoderankBuffer = z.infer<typeof CoderankBufferSchema>;

export const EditorMapValueSchema = CoderankBufferSchema;
export type EditorMapValue = CoderankBuffer;

export const EditorMapSchema = z.record(EditorMapValueSchema).default({});
export type EditorMap = z.infer<typeof EditorMapSchema>;

export const MachineMapValueSchema = z.object({
    editors: EditorMapSchema,
});
export type MachineMapValue = z.infer<typeof MachineMapValueSchema>;

export const MachineMapSchema = z.record(MachineMapValueSchema).default({});
export type MachineMap = z.infer<typeof MachineMapSchema>;

export const CoderankStatsSchema = z.object({
    machines: MachineMapSchema,
});
export type CoderankStats = z.infer<typeof CoderankStatsSchema>;

export const CoderankStatsMapSchema = z.record(CoderankStatsSchema).default({});
export type CoderankStatsMap = z.infer<typeof CoderankStatsMapSchema>;

export const CoderankFileSchema = z.object({
    version: VersionSchema,
    years: CoderankStatsMapSchema,
    pastFiveWeeks: CoderankStatsMapSchema,
});
export type CoderankFile = z.infer<typeof CoderankFileSchema>;

export const CoderankProviderStatsSchema = z.object({
    rank: z.number().default(0),
    added: z.number().default(0),
    deleted: z.number().default(0),
});
export type CoderankProviderStats = z.infer<typeof CoderankProviderStatsSchema>;
