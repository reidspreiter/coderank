import { z } from "zod";

export const LATEST_SCHEMA_VERSION = "0.4.0";
export const LATEST_WEB_VIEWER_VERSION = "0.4.0";

const VersionSchema = z.string().default(LATEST_SCHEMA_VERSION);
const WebViewerVersionSchema = z.string().default(LATEST_WEB_VIEWER_VERSION);

export const WebViewerRecordSchema = z.object({
    version: WebViewerVersionSchema,
});
export type WebViewerRecord = z.infer<typeof WebViewerRecordSchema>;

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
});
export type MainStats = z.infer<typeof MainStatsSchema>;

export const CharMapValueSchema = z.object({
    added: z.number().default(0),
    added_typed: z.number().default(0),
    added_pasted: z.number().default(0),
});
export type CharMapValue = z.infer<typeof CharMapValueSchema>;

export const CharMapSchema = z.record(CharMapValueSchema).default({});
export type CharMap = z.infer<typeof CharMapSchema>;

export const MainStatsCharsSchema = MainStatsSchema.extend({
    chars: CharMapSchema,
});
export type MainStatsChars = z.infer<typeof MainStatsCharsSchema>;

export const LangMapSchema = z.record(MainStatsSchema).default({});
export type LangMap = z.infer<typeof LangMapSchema>;

export const LangMapCharsSchema = z.record(MainStatsCharsSchema).default({});
export type LangMapChars = z.infer<typeof LangMapCharsSchema>;

export const StatsMapValueSchema = MainStatsCharsSchema.extend({
    languages: LangMapSchema,
});
export type StatsMapValue = z.infer<typeof StatsMapValueSchema>;

export const StatsMapSchema = z.record(StatsMapValueSchema).default({});
export type StatsMap = z.infer<typeof StatsMapSchema>;

export const CoderankBufferSchema = MainStatsCharsSchema.extend({
    languages: LangMapCharsSchema,
});
export type CoderankBuffer = z.infer<typeof CoderankBufferSchema>;

export const CoderankStatsSchema = CoderankBufferSchema.extend({
    machines: StatsMapSchema,
    projects: StatsMapSchema,
});
export type CoderankStats = z.infer<typeof CoderankStatsSchema>;

export const CoderankStatsMapSchema = z.record(CoderankStatsSchema).default({});
export type CoderankStatsMap = z.infer<typeof CoderankStatsMapSchema>;

export const CoderankLocalFileSchema = z.object({
    version: VersionSchema,
    years: CoderankStatsMapSchema,
    pastFiveWeeks: CoderankStatsMapSchema,
});
export type CoderankLocalFile = z.infer<typeof CoderankLocalFileSchema>;

export const CoderankRemoteFileSchema = CoderankStatsSchema.extend({
    version: VersionSchema,
    years: CoderankStatsMapSchema,
    pastFiveWeeks: CoderankStatsMapSchema,
});
export type CoderankRemoteFile = z.infer<typeof CoderankRemoteFileSchema>;

export const CoderankProviderStatsSchema = z.object({
    rank: z.number().default(0),
    added: z.number().default(0),
    deleted: z.number().default(0),
});
export type CoderankProviderStats = z.infer<typeof CoderankProviderStatsSchema>;
