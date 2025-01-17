import { z } from "zod";

const VersionSchema = z.string().default("0.2.0");

export const CharMapSchema = z.record(z.number()).default({});
export type CharMap = z.infer<typeof CharMapSchema>;

export const LanguageSchema = z.object({
    language: z.string().default("unknown"),
    added: z.number().default(0),
    deleted: z.number().default(0),
});
export type Language = z.infer<typeof LanguageSchema>;

export const LanguageWithCharsSchema = LanguageSchema.extend({
    chars: CharMapSchema,
});
export type LanguageWithChars = z.infer<typeof LanguageWithCharsSchema>;

export const FieldsSchema = z.object({
    rank: z.number().default(0),
    net: z.number().default(0),
    added: z.number().default(0),
    deleted: z.number().default(0),
    chars: CharMapSchema,
    rankBuffer: z.number().default(0),
});
export type Fields = z.infer<typeof FieldsSchema>;

export const FieldsWithLanguageSchema = FieldsSchema.extend({
    languages: z.array(LanguageSchema).default([]),
});
export type FieldsWithLanguage = z.infer<typeof FieldsWithLanguageSchema>;

export const WeeklyFieldsSchema = FieldsSchema.extend({
    week: z.number().default(0),
    languages: z.array(LanguageWithCharsSchema).default([]),
});
export type WeeklyFields = z.infer<typeof WeeklyFieldsSchema>;

export const TotalFieldsSchema = z.object({
    version: VersionSchema,
    rank: z.number().default(0),
    net: z
        .string()
        .default("0")
        .transform((x) => BigInt(x)),
    added: z
        .string()
        .default("0")
        .transform((x) => BigInt(x)),
    deleted: z
        .string()
        .default("0")
        .transform((x) => BigInt(x)),
    chars: CharMapSchema,
    rankBuffer: z.number().default(0),
    languages: z.array(LanguageSchema).default([]),
    years: z.array(z.string()).default([]),
});
export type TotalFields = z.infer<typeof TotalFieldsSchema>;

export const StatsSchema = FieldsWithLanguageSchema.extend({
    version: VersionSchema,
    year: z.number(),
    weeks: z.array(WeeklyFieldsSchema),
});
export type Stats = z.infer<typeof StatsSchema>;
