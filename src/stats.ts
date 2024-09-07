import { ExtensionContext, window, QuickPickItem, ProgressLocation, Progress } from "vscode";
import { CharData, CharMap, combineCharMaps } from "./characters";
import path from "path";
import { promises as fs } from "fs";
import { getYear, getWeek, stringify, readJSONFile, getDirectoryFiles } from "./util";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { Mode } from "./config";
import { Git } from "./git";

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
};

type FieldsJSONWeek = Fields & {
    chars: CharMap;
    week: number;
};

type FieldsJSONBig = Fields & {
    chars: CharMap;
    total: bigint;
    added: bigint;
    deleted: bigint;
};

type FieldType = {
    base: Fields;
    json: FieldsJSON;
    jsonWeek: FieldsJSONWeek;
    jsonBig: FieldsJSONBig;
};

type FieldValues = {
    base: Partial<Fields>;
    json: Partial<FieldsJSON>;
    jsonWeek: Partial<FieldsJSONWeek>;
    jsonBig: Partial<FieldsJSONBig>;
};

function buildFields<T extends keyof FieldType>(type: T, options?: FieldValues[T]): FieldType[T] {
    const defaultFields = {
        rank: 0,
        total: type === "jsonBig" ? BigInt(0) : 0,
        added: type === "jsonBig" ? BigInt(0) : 0,
        deleted: type === "jsonBig" ? BigInt(0) : 0,
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

function convertFields<T extends "base" | "json" | "jsonWeek", Y extends keyof FieldType>(
    to: Y,
    fields: FieldType[T]
): FieldType[Y] {
    const { rank, total, added, deleted, chars, rankBuffer } = fields;

    return {
        rank,
        total: to === "jsonBig" ? BigInt(total) : total,
        added: to === "jsonBig" ? BigInt(added) : added,
        deleted: to === "jsonBig" ? BigInt(deleted) : deleted,
        chars: to === "base" ? new CharData(chars as CharMap) : (chars.map ?? chars),
        rankBuffer,
    } as FieldType[Y];
}

type StatsJSON = {
    year: number;
    total: FieldsJSON;
    weeks: FieldsJSONWeek[];
};

function buildStatsJSON(year: number, week: number): StatsJSON {
    return {
        year,
        total: buildFields("json"),
        weeks: Array.from({ length: week }, (_, i) => buildFields("jsonWeek", { week: i + 1 })),
    };
}

function addStatsJSON(base: StatsJSON, addend: StatsJSON): StatsJSON {
    base.total = addFields("json", base.total, addend.total);

    for (const addendWeek of addend.weeks) {
        let baseWeek = base.weeks.find((week) => week.week === addendWeek.week);
        if (baseWeek) {
            Object.assign(baseWeek, addFields("jsonWeek", baseWeek, addendWeek));
        } else {
            base.weeks.push(addendWeek);
        }
    }
    return base;
}

class FileNameItem implements QuickPickItem {
    label: string;

    constructor(label: string) {
        this.label = label;
    }
}

export class Stats {
    private totalFilename: string = "totalcoderank.json";
    private coderankFilePattern: RegExp = /^coderank.*\d{4}\.json$/;
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
        this.statsFilename = this.getFileName();
    }

    private getFileName(year: number | string = this.year): string {
        return `coderank${year}.json`;
    }

    updateProjectRank(): void {
        if (this.project.rankBuffer >= RANK_SIZE) {
            this.project.rankBuffer -= RANK_SIZE;
            this.project.rank++;
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
            await fs.writeFile(backupPath, await zip(stringify(yearStats)), "utf-8");
        } catch (err) {
            window.showErrorMessage(`Error writing backup file: ${err}`);
        }
    }

    private async writeTotalFile(directory: string): Promise<void> {
        const totalPath = path.join(directory, this.totalFilename);
        let totalFields = buildFields("jsonBig");
        try {
            const filenames = await getDirectoryFiles(directory, {
                pattern: this.coderankFilePattern,
            });
            for (const name of filenames) {
                const yearStats = await readJSONFile<StatsJSON>(path.join(directory, name));
                if (yearStats) {
                    let converted = convertFields("jsonBig", yearStats.total);
                    totalFields = addFields("jsonBig", totalFields, converted);
                }
            }
            await fs.writeFile(totalPath, stringify(totalFields), "utf-8");
        } catch (err) {
            window.showErrorMessage(`Error writing total file: ${err}`);
        }
    }

    private async getYearStats(
        coderankDir: string,
        coderankPath: string,
        mode: Mode
    ): Promise<StatsJSON> {
        let yearStats = await readJSONFile<StatsJSON>(coderankPath);

        if (yearStats === null) {
            // A new year has started. If the user used coderank last year, update backup and total
            const prevYearPath = path.join(coderankDir, this.getFileName(this.year - 1));
            const prevYearStats = await readJSONFile<StatsJSON>(prevYearPath);

            if (prevYearStats !== null) {
                if (mode === "local") {
                    await this.writeBackupFile(coderankDir, this.year - 1, prevYearStats);
                    await this.writeTotalFile(coderankDir);
                }
            }
            yearStats = buildStatsJSON(this.year, this.week);
        } else if (yearStats.weeks.length < this.week) {
            // A new week has started, update backup and total
            if (mode === "local") {
                await this.writeBackupFile(coderankDir, this.year, yearStats);
                await this.writeTotalFile(coderankDir);
            }

            for (let i = yearStats.weeks.length + 1; i <= this.week; i++) {
                yearStats.weeks.push(buildFields("jsonWeek", { week: i }));
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
                convertFields("json", projectStatsCopy)
            );

            this.local = convertFields("base", yearStats.total);
            yearStats.weeks[this.week - 1] = addFields(
                "jsonWeek",
                yearStats.weeks[this.week - 1],
                convertFields("jsonWeek", projectStatsCopy)
            );

            await fs.writeFile(coderankPath, stringify(yearStats), "utf-8");
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
            const yearStats = await readJSONFile<StatsJSON>(coderankPath);
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

    private async deleteLocalCoderankFiles(coderankDir: string): Promise<void> {
        const filepaths = await getDirectoryFiles(coderankDir, {
            pattern: this.coderankFilePattern,
            fullPath: true,
        });
        for (const path of filepaths) {
            fs.rm(path);
        }
        fs.rm(path.join(coderankDir, this.totalFilename));
        this.local = buildFields("base");
    }

    async loadBackup(context: ExtensionContext): Promise<void> {
        const coderankDir = context.globalStorageUri.fsPath;
        const backupDir = path.join(coderankDir, "backups");
        try {
            await fs.mkdir(backupDir, { recursive: true });
            const filenames = (
                await getDirectoryFiles(backupDir, { pattern: /^coderank.*\d{4}\.json$/ })
            ).sort();

            if (filenames.length === 0) {
                window.showWarningMessage(
                    "Could not find an existing backup file. " +
                    "Backup files are updated on a weekly basis. " + 
                    "If this is your first week using coderank, it is possible that one hasn't been created yet."
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
            const backupStats = (await unzip(compressedStats)).toString();
            const overwritePath = path.join(coderankDir, this.getFileName(backupYear));

            await fs.writeFile(overwritePath, backupStats, "utf-8");
            await this.writeTotalFile(coderankDir);
            window.showInformationMessage(`Successfully loaded ${backupPath}`);
        } catch (err) {
            window.showErrorMessage(`Error loading backup: ${err}`);
        }
    }

    private async addLocalFilesToRemote(
        coderankDir: string,
        repoDir: string,
        reportProgress?: (increment: number, message: string) => void
    ) {
        const filenames = await getDirectoryFiles(coderankDir, {
            pattern: this.coderankFilePattern,
        });

        if (reportProgress) {
            reportProgress(50, `Summing ${this.totalFilename}`);
        }
        let newRemoteTotal = await readJSONFile<FieldsJSONBig>(
            path.join(coderankDir, this.totalFilename)
        );
        const remoteTotalPath = path.join(repoDir, this.totalFilename);
        const currRemoteTotal = await readJSONFile<FieldsJSONBig>(remoteTotalPath);

        if (currRemoteTotal && newRemoteTotal) {
            newRemoteTotal = addFields("jsonBig", newRemoteTotal, currRemoteTotal);
        }
        await fs.writeFile(remoteTotalPath, stringify(newRemoteTotal), "utf-8");

        for (const [index, filename] of filenames.entries()) {
            if (reportProgress) {
                reportProgress(50 + 19 * ((index + 1) / filenames.length), `Summing ${filename}`);
            }
            let newRemoteStats = await readJSONFile<StatsJSON>(path.join(coderankDir, filename));
            const remoteStatsPath = path.join(repoDir, filename);
            const currRemoteStats = await readJSONFile<StatsJSON>(remoteStatsPath);
            if (newRemoteStats && currRemoteStats) {
                newRemoteStats = addStatsJSON(currRemoteStats, newRemoteStats);
            }
            await fs.writeFile(remoteStatsPath, stringify(newRemoteStats), "utf-8");

            if (newRemoteStats?.year === this.year) {
                this.remote = convertFields("base", newRemoteStats.total);
            }
        }
    }

    async dumpLocalToRemote(context: ExtensionContext): Promise<void> {
        const coderankDir = context.globalStorageUri.fsPath;

        const git = await Git.init(context);
        if (!git) {
            return;
        }

        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Pushing local values to ${git.repo}`,
            },
            async (progress) => {
                const reportProgress = (increment: number, message: string): void => {
                    progress.report({ increment, message });
                };

                reportProgress(0, "Dumping project to local");
                await this.dumpProjectToLocal(context, "remote");

                try {
                    reportProgress(10, "Writing local total file");
                    await this.writeTotalFile(coderankDir);

                    reportProgress(30, `Cloning ${git.repo}`);
                    await git.cloneRepo();

                    await this.addLocalFilesToRemote(
                        coderankDir,
                        git.remoteCoderankDir,
                        reportProgress
                    );

                    reportProgress(70, `Pushing to ${git.repo}/${git.branch}`);
                    await git.pushRepo();

                    reportProgress(90, `Removing local files`);
                    await this.deleteLocalCoderankFiles(coderankDir);
                    git.saveRepoAndBranch(context);

                    window.showInformationMessage(
                        `Succesfully pushed local values to ${git.repo}/${git.branch}`
                    );
                } catch (err) {
                    window.showErrorMessage(
                        `Error pushing local values to remote repository: ${err}`
                    );
                } finally {
                    await git.teardown();
                }
            }
        );
    }
}
