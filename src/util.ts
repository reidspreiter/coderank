import { promises as fs } from "fs";
import path from "path";

export const RANK_SIZE = 10000;
export enum Location {
    Project = "project",
    Local = "local",
    Remote = "remote",
}

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

export function getTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");
    const milliseconds = now.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
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
