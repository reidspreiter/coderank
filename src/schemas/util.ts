import { promises as fs } from "fs";

import * as z from "zod";

import * as s from "./schemas";

// TODO: If zod behavior changes, coordinate schema and T to ensure a matching schema is passed
/**
 * @param filePath path to a json file
 * @param schema zod schema to validate json
 * @returns object of `schema`, or `null` if `filePath` does not exist
 */
export async function readJSONFile<T extends z.ZodTypeAny>(
    filePath: string,
    schema: T
): Promise<z.infer<T> | null> {
    try {
        const data = await fs.readFile(filePath, "utf-8");
        const json = JSON.parse(data);
        return schema.parse(json);
    } catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error(`JSON Parsing Error: filepath: '${filePath}': ${JSON.stringify(err)}`);
        }

        if (err instanceof z.ZodError) {
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

/**
 *
 * @param obj any object
 * @returns `JSON.stringify` but with `BigInt` support
 */
export function stringify(obj: object): string {
    return JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

/**
 *
 * @param obj
 * @param schema
 * @returns a deep clone of `obj`
 */
export function clone<T extends z.ZodTypeAny>(obj: z.infer<T>, schema: T): z.infer<T> {
    return schema.parse(JSON.parse(stringify(obj)));
}

/**
 * Converts a `string` into a `CharMap`.
 *
 * If `base` is provided, `text`'s characters are added to `base`.
 *
 * '\r' is always ignored.
 *
 * @param text a string of text
 * @param base an optional `CharMap` to add to
 * @returns a `CharMap` containing the characters from `text`
 */
export function parseStringToCharMap(text: string, base?: s.CharMap): s.CharMap {
    if (base === undefined) {
        base = s.CharMapSchema.parse({});
    }
    const filtered_text = text.length <= 2 ? text.replaceAll("\r", "") : text;

    if (filtered_text.length > 1) {
        for (const char of text) {
            if (char === "\r") {
                continue;
            }
            const entry = base[char] || s.CharMapValueSchema.parse({});
            entry.added += 1;
            entry.added_pasted += 1;
            base[char] = entry;
        }
    } else {
        const entry = base[filtered_text] || s.CharMapValueSchema.parse({});
        entry.added += 1;
        entry.added_typed += 1;
        base[filtered_text] = entry;
    }
    return base;
}

export function sumCharMaps(base: s.CharMap, addend: s.CharMap): s.CharMap {
    for (const char in addend) {
        const stats = addend[char];
        const entry = base[char] || s.CharMapValueSchema.parse({});
        entry.added += stats.added;
        entry.added_typed += stats.added_typed;
        entry.added_pasted += stats.added_pasted;
        base[char] = entry;
    }
    return base;
}

export function sumMainStats<T extends s.MainStats, Y extends s.MainStats>(base: T, addend: Y): T {
    base.rank += addend.rank;
    base.added += addend.added;
    base.added_pasted += addend.added_pasted;
    base.added_typed += addend.added_typed;
    base.num_pastes += addend.num_pastes;
    base.deleted += addend.deleted;
    base.deleted_typed += addend.deleted_typed;
    base.deleted_cut += addend.deleted_cut;
    base.num_cuts += addend.num_cuts;
    base.chars = sumCharMaps(base.chars, addend.chars);
    return base;
}

export function sumLangMaps(base: s.LangMap, addend: s.LangMap): s.LangMap {
    for (const lang in addend) {
        base[lang] = sumMainStats(base[lang] || s.MainStatsSchema.parse({}), addend[lang]);
    }
    return base;
}

export function sumCoderankBuffers<T extends s.CoderankBuffer, Y extends s.CoderankBuffer>(
    base: T,
    addend: Y
): T {
    base.languages = sumLangMaps(base.languages, addend.languages);
    return base;
}

export function sumEditorMaps(base: s.EditorMap, addend: s.EditorMap): s.EditorMap {
    for (const key in addend) {
        base[key] = sumCoderankBuffers(base[key] || s.EditorMapValueSchema.parse({}), addend[key]);
    }
    return base;
}

export function sumMachineMaps(base: s.MachineMap, addend: s.MachineMap): s.MachineMap {
    for (const key in addend) {
        if (!base[key]) {
            base[key] = s.MachineMapValueSchema.parse({});
        }
        base[key].editors = sumEditorMaps(
            base[key].editors || s.EditorMapValueSchema.parse({}),
            addend[key].editors
        );
    }
    return base;
}

export function sumBufferToLocalFile(
    localFile: s.CoderankFile,
    buffer: s.CoderankBuffer,
    year: string,
    machine: string
): s.CoderankFile {
    let yearStats = localFile.years[year] || s.CoderankStatsSchema.parse({});
    if (!yearStats.machines[machine]) {
        yearStats.machines[machine] = s.MachineMapValueSchema.parse({});
    }

    yearStats.machines[machine].editors[s.EDITOR_NAME] = sumCoderankBuffers(
        yearStats.machines[machine].editors[s.EDITOR_NAME] || s.EditorMapValueSchema.parse({}),
        buffer
    );

    console.log(yearStats.machines[machine].editors[s.EDITOR_NAME]);

    localFile.years[year] = yearStats;
    return localFile;
}

export function sumCoderankStats<T extends s.CoderankStats, Y extends s.CoderankStats>(
    base: T,
    addend: Y
): T {
    base.machines = sumMachineMaps(base.machines, addend.machines);
    return base;
}

export function sumLocalFileToRemoteFile(
    remoteFile: s.CoderankFile,
    localFile: s.CoderankFile
): s.CoderankFile {
    for (const year in localFile.years) {
        remoteFile.years[year] = sumCoderankStats(
            remoteFile.years[year] || s.CoderankStatsSchema.parse({}),
            localFile.years[year]
        );
    }
    return remoteFile;
}
