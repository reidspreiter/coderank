import { promises as fs } from "fs";
import path from "path";

export const RANK_SIZE = 10000;

export function getDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getWeek(): number {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + 1) / 7);
    return weekNumber;
}

export function getYear(): number {
    const now = new Date();
    return now.getFullYear();
}

export function stringify(fields: any): string {
    return JSON.stringify(fields, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function parse<T>(jsonString: any): T {
    const data = JSON.parse(jsonString);

    if (
        typeof data.total === "string" &&
        typeof data.added === "string" &&
        typeof data.deleted === "string"
    ) {
        data.total = BigInt(data.total);
        data.added = BigInt(data.added);
        data.deleted = BigInt(data.deleted);
    }
    return data as T;
}

interface GetDirectoryFilesOptions {
    fullPath?: boolean;
    pattern?: RegExp;
}

export async function getDirectoryFiles(
    directory: string,
    options: GetDirectoryFilesOptions = {}
): Promise<string[]> {
    const filenames: string[] = [];
    const { fullPath = false, pattern = /.*/ } = options;

    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.forEach((entry) => {
        if (entry.isFile() && pattern.test(entry.name)) {
            filenames.push(fullPath ? path.join(directory, entry.name) : entry.name);
        }
    });
    return filenames;
}

export async function readJSONFile<T>(filePath: string): Promise<T | null> {
    try {
        const data = await fs.readFile(filePath, "utf-8");
        return parse<T>(data);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            throw err;
        }
        return null;
    }
}
