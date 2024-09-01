import { ExtensionContext, window } from "vscode";
import { CharData, CharMap, combineCharMaps } from "./characters";
import path from "path";
import { promises as fs } from "fs";
import { getYear, getWeek, dynamicSuccessMessage } from "./util";
import { gzip } from "zlib";
import { promisify } from "util";

const zip = promisify(gzip);
const RANK_SIZE = 100000;

export type Fields = {
    rank: number;
    total: number;
    added: number;
    deleted: number;
    chars: CharData;
    rankBuffer: number;
};

type FieldsJSON = Fields & {
    chars: CharMap;
    week?: number;
};

type FieldsTotalJSON = Fields & {
    chars: CharMap;
    total: bigint;
    added: bigint;
    deleted: bigint;
};

type FieldType = {
    base: Fields;
    json: FieldsJSON;
    jsonTotal: FieldsTotalJSON;
};

type FieldValues = {
    base: Partial<Fields>;
    json: Partial<FieldsJSON>;
    jsonTotal: Partial<FieldsTotalJSON>;
};

export type FieldLocation = "project" | "local" | "remote";

function buildFields<T extends keyof FieldType>(type: T, options?: FieldValues[T]): FieldType[T] {
    const defaultFields = {
        rank: 0,
        total: 0,
        added: 0,
        deleted: 0,
        rankBuffer: 0,
        chars: type === "base" ? new CharData() : ({} as CharMap),
    };

    return {
        ...defaultFields,
        ...options,
    } as FieldType[T];
}

function addFields<T extends keyof FieldType>(
    type: T,
    base: FieldType[T],
    addend: FieldType[T]
): FieldType[T] {
    const { added, deleted, rank, rankBuffer, chars } = addend;
    base.added += added;
    base.deleted += deleted;
    base.total = base.added - base.deleted;
    base.rank += rank;
    base.rankBuffer += rankBuffer;

    if (base.rankBuffer >= RANK_SIZE) {
        base.rankBuffer -= RANK_SIZE;
        base.rank++;
    }

    if (type === "base") {
        base.chars.append(chars.map);
    } else {
        (base.chars as CharMap) = combineCharMaps(base.chars as CharMap, chars as CharMap);
    }
    return base;
}

function convertFields<T extends "base" | "json", Y extends keyof FieldType>(
    from: T,
    to: Y,
    fields: FieldType[T]
): FieldType[Y] {
    const { rank, total, added, deleted, chars, rankBuffer } = fields;

    return {
        rank,
        total: to === "jsonTotal" ? BigInt(total) : total,
        added: to === "jsonTotal" ? BigInt(added) : added,
        deleted: to === "jsonTotal" ? BigInt(deleted) : deleted,
        chars: to === "base" ? new CharData(chars as CharMap) : (chars.map ?? chars),
        rankBuffer,
    } as FieldType[Y];
}

type StatsJSON = {
    year: number;
    total: FieldsJSON;
    weeks: FieldsJSON[];
};

function buildStatsJSON(year: number, week: number): StatsJSON {
    return {
        year,
        total: buildFields("json"),
        weeks: Array.from({ length: week }, (_, i) => buildFields("json", { week: i + 1 })),
    };
}

export class Stats {
    private totalFilename: string = "totalcoderank.json";
    private statsFilename: string;
    private week: number;
    private year: number;
    project: Fields;
    local: Fields;
    remote: Fields;

    constructor() {
        this.project = buildFields("base");
        this.local = buildFields("base");
        this.remote = buildFields("base");
        this.week = getWeek();
        this.year = getYear();
        this.statsFilename = this.makeFileName();
    }

    private makeFileName(year: number = this.year): string {
        return `coderank${year}.json`;
    }

    updateProjectRank(): void {
        if (this.project.rankBuffer >= RANK_SIZE) {
            this.project.rankBuffer -= RANK_SIZE;
            this.project.rank++;
        }
    }

    private async dirExists(path: string): Promise<boolean> {
        try {
            await fs.mkdir(path, { recursive: true });
            return true;
        } catch (err) {
            window.showErrorMessage(`Error making directory ${path}: ${err}`);
            return false;
        }
    }

    private async readJSONFile<T>(filePath: string): Promise<T | null | undefined> {
        try {
            const data = await fs.readFile(filePath, "utf-8");
            return JSON.parse(data);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                window.showErrorMessage(`Error reading from ${filePath}: ${err}`);
                return undefined;
            }
            return null;
        }
    }

    private async writeJSONFile(filePath: string, data: any): Promise<boolean> {
        try {
            await fs.writeFile(filePath, data, "utf-8");
            return true;
        } catch (err) {
            window.showErrorMessage(`Error writing to ${filePath}: ${err}`);
            return false;
        }
    }

    private async writeBackupFile(
        directory: string,
        year: number,
        yearStats: StatsJSON
    ): Promise<void> {
        const backupDir = path.join(directory, "backups");
        if (await this.dirExists(backupDir)) {
            const backupPath = path.join(backupDir, `backupcoderank${year}.json`);
            await this.writeJSONFile(backupPath, await zip(JSON.stringify(yearStats)));
        }
    }

    private async updateTotalFile(directory: string, yearStats: StatsJSON): Promise<void> {
        const totalPath = path.join(directory, this.totalFilename);
        let total = await this.readJSONFile<FieldsTotalJSON>(totalPath);
        if (total !== undefined) {
            if (total === null) {
                total = buildFields("jsonTotal");
            }
            const prevWeekStats = yearStats.weeks.at(-1) ?? buildFields("json");
            total = addFields("jsonTotal", total, {
                ...convertFields("json", "jsonTotal", prevWeekStats),
            });
            await this.writeJSONFile(totalPath, JSON.stringify(total));
        }
    }

    async storeLocal(
        context: ExtensionContext,
        calledAutomatically: boolean = true
    ): Promise<void> {
        const coderankDir = context.globalStorageUri.fsPath;
        const coderankPath = path.join(coderankDir, this.statsFilename);

        if (!(await this.dirExists(coderankDir))) {
            return;
        }

        let yearStats = await this.readJSONFile<StatsJSON>(coderankPath);
        if (yearStats === undefined) {
            return;
        } else if (yearStats === null) {
            // A new year has started
            const prevYearPath = path.join(coderankDir, this.makeFileName(this.year - 1));
            const prevYearStats = await this.readJSONFile<StatsJSON>(prevYearPath);

            // If the user used coderank last year
            if (prevYearStats !== null && prevYearStats !== undefined) {
                await this.writeBackupFile(coderankDir, this.year - 1, prevYearStats);
                await this.updateTotalFile(coderankDir, prevYearStats);
            }
            yearStats = buildStatsJSON(this.year, this.week);
        } else if (yearStats.weeks.length < this.week) {
            // A new week has started
            await this.writeBackupFile(coderankDir, this.year, yearStats);
            await this.updateTotalFile(coderankDir, yearStats);

            for (let i = yearStats.weeks.length + 1; i <= this.week; i++) {
                yearStats.weeks.push(buildFields("json", { week: i }));
            }
        }

        const projectStats = this.project;
        this.project = buildFields("base");

        yearStats.total = addFields(
            "json",
            yearStats.total,
            convertFields("base", "json", projectStats)
        );
        this.local = convertFields("json", "base", yearStats.total);

        yearStats.weeks[this.week - 1] = addFields(
            "json",
            yearStats.weeks[this.week - 1],
            convertFields("base", "json", projectStats)
        );

        if (await this.writeJSONFile(coderankPath, JSON.stringify(yearStats))) {
            dynamicSuccessMessage(`Saved coderank data to ${coderankPath}`, calledAutomatically);
        } else {
            this.project = projectStats;
            this.local = buildFields("base");
        }
    }

    async loadLocal(context: ExtensionContext): Promise<void> {
        const coderankPath = path.join(context.globalStorageUri.fsPath, this.statsFilename);
        const yearStats = await this.readJSONFile<StatsJSON>(coderankPath);

        if (yearStats) {
            this.local = buildFields("base", {
                ...yearStats.total,
                chars: new CharData(yearStats.total.chars),
            });
            window.setStatusBarMessage("Loaded local coderank data", 8000);
        }
    }
}
