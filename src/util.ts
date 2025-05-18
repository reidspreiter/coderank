import { promises as fs } from "fs";
import path from "path";

export const RANK_SIZE = 10000;
export const RANK_INCREMENT = 1 / RANK_SIZE;
export const CODERANK_FILENAME = "coderank.json";
export const AUTOPUSH_RECORD_FILENAME = "autoPushRecord.json";

export function getDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getWeek(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + 1) / 7);
    return String(weekNumber);
}

function getNumWeeksInYear(year: number): number {
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 28);
    const days = Math.floor((endOfYear.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const maxWeeks = Math.ceil((days + 1) / 7);
    return maxWeeks;
}

export function getPreviousFiveWeeks(currentWeek: number, currentYear: number): number[] {
    const previousWeeks: number[] = [currentWeek];

    if (currentWeek >= 5) {
        for (let i = 1; i < 5; i++) {
            previousWeeks.push(currentWeek - i);
        }
    } else {
        const numWeeksInPrevYear = getNumWeeksInYear(currentYear - 1);

        for (let i = 1; i <= 4; i++) {
            let prevWeek = currentWeek - i;
            if (prevWeek <= 0) {
                prevWeek += numWeeksInPrevYear;
            }
            previousWeeks.push(prevWeek);
        }
    }

    return previousWeeks;
}

export function getYear(): string {
    const now = new Date();
    return String(now.getFullYear());
}

export function getTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");
    const milliseconds = now.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export async function copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

export async function pathExists(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}
