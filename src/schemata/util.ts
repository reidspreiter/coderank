import { promises as fs } from "fs";

import { ZodSchema, ZodError } from "zod";

import { RANK_SIZE } from "../util/common";

import * as s from "./schemata";

type LanguageProtocol = s.Language & { chars?: s.CharMap };
type RankProtocol = { rank: number; rankBuffer: number };

// TODO: If zod behavior changes, coordinate schema and T to ensure a matching schema is passed
/**
 * @param filePath Path to a json file
 * @param schema Zod schema to validate json
 * @returns Object following schema, or null if path does not exist
 */
export async function readJSONFile<T>(filePath: string, schema: ZodSchema): Promise<T | null> {
    try {
        const data = await fs.readFile(filePath, "utf-8");
        const json = JSON.parse(data);
        return schema.parse(json) as T;
    } catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error(`JSON Parsing Error: filepath: '${filePath}': ${JSON.stringify(err)}`);
        }

        if (err instanceof ZodError) {
            throw new Error(
                `Validation Error: filepath: '${filePath}': ${JSON.stringify(err.errors)}`
            );
        }

        const fsError = err as NodeJS.ErrnoException;
        if (fsError.code === "ENOENT") {
            return null;
        }
        throw new Error(
            `Unexpected error while reading file "${filePath}": ${JSON.stringify(err)}`
        );
    }
}

export function findLanguage<T extends LanguageProtocol>(
    languages: T[],
    language: string
): T | null {
    return languages.find((fields) => fields.language === language) || null;
}

/**
 *
 * @param year The current year
 * @returns A Stats object with all weeks initialized
 */
export function buildStats(year: number): s.Stats {
    return s.StatsSchema.parse({
        year,
        total: s.FieldsSchema.parse({}),
        weeks: Array.from({ length: 53 }, (_, i) => s.WeeklyFieldsSchema.parse({ week: i + 1 })),
    });
}

export function stringify(obj: object): string {
    return JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function parseTextToCharMap(text: string, base: s.CharMap = {}): s.CharMap {
    for (const char of text) {
        if (char === "\r") {
            continue;
        }
        base[char] = (base[char] ?? 0) + 1;
    }
    return base;
}

export function checkRankBufferOverflow<T extends RankProtocol>(base: T): T {
    if (base.rankBuffer >= RANK_SIZE) {
        base.rankBuffer -= RANK_SIZE;
        base.rank++;
    }
    return base;
}

export function sumCharMaps(base: s.CharMap, addend: s.CharMap): s.CharMap {
    for (const [key, val] of Object.entries(addend)) {
        base[key] = (base[key] ?? 0) + val;
    }
    return base;
}

export function sumFields<T extends s.TotalFields, Y extends s.TotalFields>(base: T, addend: Y): T;
export function sumFields<T extends s.Fields, Y extends s.Fields>(base: T, addend: Y): T;
export function sumFields(base: any, addend: any): any {
    base.rank += addend.rank;
    base.added += addend.added;
    base.deleted += addend.deleted;
    base.net = base.added - base.deleted;
    base.rankBuffer += addend.rankBuffer;
    base.chars = sumCharMaps(base.chars, addend.chars);
    base = checkRankBufferOverflow(base);
    return base;
}

export function sumLanguages<T extends LanguageProtocol, Y extends LanguageProtocol>(
    base: T[],
    addend: Y[],
    addChars: boolean = false
): T[] {
    addend.forEach((language) => {
        const baseLanguage = findLanguage(base, language.language);
        if (baseLanguage) {
            baseLanguage.added += language.added;
            baseLanguage.deleted += language.deleted;
            if (baseLanguage.chars !== undefined && language.chars !== undefined) {
                baseLanguage.chars = sumCharMaps(baseLanguage.chars, language.chars);
            }
        } else {
            if (addChars) {
                base.push(s.LanguageWithCharsSchema.parse(language) as T);
            } else {
                base.push(s.LanguageSchema.parse(language) as T);
            }
        }
    });
    return base;
}

export function sumStatsToTotalFields(total: s.TotalFields, stats: s.Stats): s.TotalFields {
    total = sumFields(
        total,
        s.TotalFieldsSchema.parse({
            rank: stats.rank,
            rankBuffer: stats.rankBuffer,
            added: stats.added.toString(),
            deleted: stats.deleted.toString(),
            chars: stats.chars,
        })
    );
    total.languages = sumLanguages(total.languages, stats.languages);
    return total;
}

export function sumProjectToStats(stats: s.Stats, project: s.WeeklyFields): s.Stats {
    stats = sumFields(stats, project);
    stats.languages = sumLanguages(stats.languages, project.languages);

    let statsWeek = stats.weeks[project.week - 1];
    statsWeek = sumFields(statsWeek, project);
    statsWeek.languages = sumLanguages(statsWeek.languages, project.languages, true);

    return stats;
}

export function sumTotalFields(base: s.TotalFields, addend: s.TotalFields): s.TotalFields {
    base = sumFields(base, addend);
    base.languages = sumLanguages(base.languages, addend.languages);
    return base;
}

export function sumStats(base: s.Stats, addend: s.Stats): s.Stats {
    base = sumFields(base, addend);
    base.languages = sumLanguages(base.languages, addend.languages);

    addend.weeks.forEach((week, index) => {
        let baseWeek = base.weeks[index];
        baseWeek = sumFields(baseWeek, week);
        baseWeek.languages = sumLanguages(baseWeek.languages, week.languages, true);
    });

    return base;
}
