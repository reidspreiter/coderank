import { ExtensionContext, window, QuickPickItem, QuickPickItemKind } from "vscode";
import { CharData, CharMap, combineCharMaps } from "./characters";
import path from "path";
import { promises as fs } from "fs";
import { getYear, getWeek } from "./util";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { Mode } from "./config";

const zip = promisify(gzip);
const unzip = promisify(gunzip);

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

class FileNameItem implements QuickPickItem {
    label: string;

    constructor(label: string) {
        this.label = label;
    }
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

    private makeFileName(year: number | string = this.year): string {
        return `coderank${year}.json`;
    }

    updateProjectRank(): void {
        if (this.project.rankBuffer >= RANK_SIZE) {
            this.project.rankBuffer -= RANK_SIZE;
            this.project.rank++;
        }
    }

    private async readJSONFile<T>(filePath: string): Promise<T | null> {
        try {
            const data = await fs.readFile(filePath, "utf-8");
            return JSON.parse(data);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                throw err;
            }
            return null;
        }
    }

    private async writeBackupFile(
        directory: string,
        year: number,
        yearStats: StatsJSON
    ): Promise<void> {
        const backupDir = path.join(directory, "backups");
        try {
            await fs.mkdir(backupDir, { recursive: true });
            const backupPath = path.join(backupDir, `coderankbackup${year}.json`);
            await fs.writeFile(backupPath, await zip(JSON.stringify(yearStats)), "utf-8");
        } catch (err) {
            window.showErrorMessage(`Error writing backup file: ${err}`);
        }
    }

    private async updateTotalFile(directory: string, yearStats: StatsJSON): Promise<void> {
        const totalPath = path.join(directory, this.totalFilename);
        try {
            let total = await this.readJSONFile<FieldsTotalJSON>(totalPath);
            if (total === null) {
                total = buildFields("jsonTotal");
            }
            const prevWeekStats = yearStats.weeks.at(-1) ?? buildFields("json");
            total = addFields("jsonTotal", total, {
                ...convertFields("json", "jsonTotal", prevWeekStats),
            });
            await fs.writeFile(totalPath, JSON.stringify(total), "utf-8");
        } catch (err) {
            window.showErrorMessage(`Error updating total file: ${err}`);
        }
    }

    private async getYearStats(
        coderankDir: string,
        coderankPath: string,
        mode: Mode
    ): Promise<StatsJSON> {
        let yearStats = await this.readJSONFile<StatsJSON>(coderankPath);

        if (yearStats === null) {
            // A new year has started. If the user used coderank last year, update backup and total
            const prevYearPath = path.join(coderankDir, this.makeFileName(this.year - 1));
            const prevYearStats = await this.readJSONFile<StatsJSON>(prevYearPath);

            if (prevYearStats !== null) {
                if (mode === "local") {
                    await this.writeBackupFile(coderankDir, this.year - 1, prevYearStats);
                }
                await this.updateTotalFile(coderankDir, prevYearStats);
            }

            yearStats = buildStatsJSON(this.year, this.week);
        } else if (yearStats.weeks.length < this.week) {
            // A new week has started, update backup and total
            if (mode === "local") {
                await this.writeBackupFile(coderankDir, this.year, yearStats);
            }
            await this.updateTotalFile(coderankDir, yearStats);

            for (let i = yearStats.weeks.length + 1; i <= this.week; i++) {
                yearStats.weeks.push(buildFields("json", { week: i }));
            }
        }
        return yearStats;
    }

    async dumpProjectToLocal(
        context: ExtensionContext,
        mode: Mode,
        automatic: boolean = true
    ): Promise<void> {
        const coderankDir = context.globalStorageUri.fsPath;
        const coderankPath = path.join(coderankDir, this.statsFilename);
        const projectStatsCopy = this.project;
        this.project = buildFields("base");
        const localStatsCopy = this.local;

        try {
            await fs.mkdir(coderankDir, { recursive: true });
            const yearStats = await this.getYearStats(coderankDir, coderankPath, mode);

            yearStats.total = addFields(
                "json",
                yearStats.total,
                convertFields("base", "json", projectStatsCopy)
            );

            this.local = convertFields("json", "base", yearStats.total);
            yearStats.weeks[this.week - 1] = addFields(
                "json",
                yearStats.weeks[this.week - 1],
                convertFields("base", "json", projectStatsCopy)
            );

            await fs.writeFile(coderankPath, JSON.stringify(yearStats), "utf-8");
            if (!automatic) {
                window.showInformationMessage(`Saved coderank data to ${coderankPath}`);
            }
        } catch (err) {
            this.project = projectStatsCopy;
            this.local = localStatsCopy;
            window.showErrorMessage(`Error dumping project values to local storage: ${err}`);
        }
    }

    async loadLocal(context: ExtensionContext): Promise<void> {
        const coderankPath = path.join(context.globalStorageUri.fsPath, this.statsFilename);
        try {
            const yearStats = await this.readJSONFile<StatsJSON>(coderankPath);
            if (yearStats) {
                this.local = buildFields("base", {
                    ...yearStats.total,
                    chars: new CharData(yearStats.total.chars),
                });
            }
        } catch (err) {
            window.showErrorMessage(`Error loading values from local storage: ${err}`);
        }
    }

    private async getCoderankFileNames(directory: string): Promise<string[]> {
        const filenames: string[] = [];
        const filenamePattern = /^coderank.*\d{4}\.json$/;

        const entries = await fs.readdir(directory, { withFileTypes: true });
        entries.forEach((entry) => {
            if (entry.isFile() && filenamePattern.test(entry.name)) {
                filenames.push(entry.name);
            }
        });
        return filenames;
    }

    async loadBackup(context: ExtensionContext): Promise<void> {
        const coderankDir = context.globalStorageUri.fsPath;
        const backupDir = path.join(coderankDir, "backups");
        try {
            await fs.mkdir(backupDir, { recursive: true });
            const filenames = (await this.getCoderankFileNames(backupDir)).sort();

            if (filenames.length === 0) {
                window.showWarningMessage(
                    "Could not find an existing backup file. Backup files are created automatically on a weekly basis, if this is your first week using coderank, it is possible that one hasn't been created yet."
                );
                return;
            }

            const quickPickItems: FileNameItem[] = filenames.map((name) => new FileNameItem(name));
            const backupFilename = await window.showQuickPick(quickPickItems, {
                placeHolder: "Select a backup file to load...",
            });

            if (!backupFilename) {
                return;
            }

            const match = backupFilename.label.match(/(\d{4})\.json$/);
            if (!match) {
                window.showErrorMessage("Error loading chosen backup file");
                return;
            }

            const backupYear = match[1];
            const backupPath = path.join(backupDir, backupFilename.label);
            const compressedStats = await fs.readFile(backupPath, "utf-8");
            const backupStats: string = JSON.parse((await unzip(compressedStats)).toString());
            const overwritePath = path.join(coderankDir, this.makeFileName(backupYear));

            await fs.writeFile(overwritePath, backupStats, "utf-8");
            window.showInformationMessage(`Successfully loaded ${backupPath}`);
        } catch (err) {
            window.showErrorMessage(`Error loading backup: ${err}`);
        }
    }
}
