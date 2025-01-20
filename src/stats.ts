import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { gzip, gunzip } from "zlib";

import { ExtensionContext, window, QuickPickItem, ProgressLocation, TextEditor } from "vscode";

import * as s from "./schemata";
import { Git, Logger } from "./services";
import { getYear, getWeek, getDirectoryFiles, RANK_SIZE } from "./util/common";

const zip = promisify(gzip);
const unzip = promisify(gunzip);

const logger = Logger.getLogger();

class FileNameItem implements QuickPickItem {
    label: string;

    constructor(label: string) {
        this.label = label;
    }
}

export class StatsManager {
    private totalFilename: string = "totalcoderank.json";
    private coderankFilePattern: RegExp = /^coderank.*\d{4}\.json$/;
    private coderankDir: string;
    private currFilePath: string;
    private currLanguage: string;
    private week: number;
    private year: number;
    project: s.WeeklyFields;
    local: s.Fields;
    remote: number;

    constructor(context: ExtensionContext) {
        this.coderankDir = context.globalStorageUri.fsPath;
        this.week = getWeek();
        this.year = getYear();
        this.project = s.WeeklyFieldsSchema.parse({ week: this.week });
        this.local = s.FieldsSchema.parse({});
        this.remote = 0;
        this.currLanguage = "unknown";
        this.currFilePath = path.join(this.coderankDir, this.getFileName());
    }

    private getFileName(year: number | string = this.year): string {
        return `coderank${year}.json`;
    }

    handleDeletion(deleted: number): void {
        this.project.net -= deleted;
        this.project.deleted += deleted;
        const languageFields = s.findLanguage(this.project.languages, this.currLanguage);
        if (languageFields) {
            languageFields.deleted += deleted;
        } else {
            this.project.languages.push(
                s.LanguageWithCharsSchema.parse({ language: this.currLanguage, deleted: deleted })
            );
        }
        this.incrementRank();
    }

    handleAddition(added: number, chars: string): void {
        this.project.net += added;
        this.project.added += added;
        this.project.chars = s.parseTextToCharMap(chars, this.project.chars);
        const languageFields = s.findLanguage(this.project.languages, this.currLanguage);
        if (languageFields) {
            languageFields.added += added;
            languageFields.chars = s.parseTextToCharMap(chars);
        } else {
            this.project.languages.push(
                s.LanguageWithCharsSchema.parse({
                    language: this.currLanguage,
                    added: added,
                    chars: s.parseTextToCharMap(chars),
                })
            );
        }
        this.incrementRank();
    }

    private incrementRank(): void {
        this.project.rankBuffer++;
        this.project = s.checkRankBufferOverflow(this.project);
    }

    updateLanguage(editor: TextEditor | undefined): void {
        let language = "unknown";
        if (editor) {
            language = editor.document.languageId;
        }
        logger.log(`Detected new language: ${language}`);
        this.currLanguage = language;
    }

    private async writeBackupFile(directory: string, year: number, stats: s.Stats): Promise<void> {
        const backupDir = path.join(directory, "backups");
        try {
            await fs.mkdir(backupDir, { recursive: true });
            const backupPath = path.join(backupDir, `coderankbackup${year}.json.zip`);
            await fs.writeFile(backupPath, await zip(s.stringify(stats)), "utf-8");
        } catch (err) {
            window.showErrorMessage(`Error writing backup file: ${err}`);
        }
    }

    private async writeTotalFile(directory: string): Promise<void> {
        const totalPath = path.join(directory, this.totalFilename);
        let totalFields = s.TotalFieldsSchema.parse({});
        try {
            const filenames = await getDirectoryFiles(directory, {
                pattern: this.coderankFilePattern,
            });
            for (const name of filenames) {
                const stats = await s.readJSONFile<s.Stats>(
                    path.join(directory, name),
                    s.StatsSchema
                );
                if (stats) {
                    totalFields = s.sumStatsToTotalFields(totalFields, stats);
                }
            }
            totalFields.years = filenames.map((name) => name.slice(8, 12));
            await fs.writeFile(totalPath, s.stringify(totalFields), "utf-8");
        } catch (err) {
            window.showErrorMessage(`Error writing total file: ${err}`);
        }
    }

    private async getStats(): Promise<s.Stats> {
        let stats = await s.readJSONFile<s.Stats>(this.currFilePath, s.StatsSchema);

        if (stats === null) {
            // A new year has started. If the user used coderank last year, update backup
            const prevYearPath = path.join(this.coderankDir, this.getFileName(this.year - 1));
            const prevYearStats = await s.readJSONFile<s.Stats>(prevYearPath, s.StatsSchema);

            if (prevYearStats !== null) {
                await this.writeBackupFile(this.coderankDir, this.year - 1, prevYearStats);
            }
            stats = s.buildStats(this.year);
        } else if (
            stats.weeks[this.week - 1].rank === 0 &&
            stats.weeks[this.week - 1].rankBuffer === 0
        ) {
            // A new week has started, update backup
            await this.writeBackupFile(this.coderankDir, this.year, stats);
        }
        return stats;
    }

    async dumpProjectToLocal(automatic: boolean = true): Promise<void> {
        const projectStatsCopy = this.project;
        this.project = s.WeeklyFieldsSchema.parse({ week: this.week });
        const localStatsCopy = this.local;

        try {
            await fs.mkdir(this.coderankDir, { recursive: true });

            let stats = await this.getStats();
            stats = s.sumProjectToStats(stats, projectStatsCopy);

            await fs.writeFile(this.currFilePath, s.stringify(stats), "utf-8");

            this.local = s.FieldsSchema.parse(stats);
            if (!automatic) {
                window.showInformationMessage(`Saved coderank data to ${this.currFilePath}`);
            }
        } catch (err) {
            this.project = projectStatsCopy;
            this.local = localStatsCopy;
            window.showErrorMessage(`Error dumping project values to local storage: ${err}`);
        }
    }

    async loadLocal(): Promise<void> {
        try {
            const stats = await s.readJSONFile<s.Stats>(this.currFilePath, s.StatsSchema);
            if (stats) {
                this.local = s.FieldsSchema.parse(stats);
            }
        } catch (err) {
            window.showErrorMessage(`Error loading values from local storage: ${err}`);
        }
    }

    private async deleteCoderankFiles(coderankDir: string): Promise<void> {
        const filepaths = await getDirectoryFiles(coderankDir, {
            pattern: this.coderankFilePattern,
            fullPath: true,
        });
        for (const path of filepaths) {
            fs.rm(path);
        }
        fs.rm(path.join(coderankDir, this.totalFilename));
        this.local = s.FieldsSchema.parse({});
    }

    async loadBackup(): Promise<void> {
        const backupDir = path.join(this.coderankDir, "backups");
        try {
            await fs.mkdir(backupDir, { recursive: true });
            const filenames = (
                await getDirectoryFiles(backupDir, { pattern: /^coderank.*\d{4}\.json$/ })
            ).sort();

            if (filenames.length === 0) {
                window.showWarningMessage(
                    "Could not find an existing backup file. " +
                    "Backup files are updated on a weekly basis and removed after pushing to remote."
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
            const overwritePath = path.join(this.coderankDir, this.getFileName(backupYear));

            await fs.writeFile(overwritePath, backupStats, "utf-8");
            await this.writeTotalFile(this.coderankDir);
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
        let newRemoteTotal = await s.readJSONFile<s.TotalFields>(
            path.join(coderankDir, this.totalFilename),
            s.TotalFieldsSchema
        );
        const remoteTotalPath = path.join(repoDir, this.totalFilename);
        const currRemoteTotal = await s.readJSONFile<s.TotalFields>(
            remoteTotalPath,
            s.TotalFieldsSchema
        );

        if (currRemoteTotal && newRemoteTotal) {
            newRemoteTotal = s.sumTotalFields(newRemoteTotal, currRemoteTotal);
        }

        if (newRemoteTotal) {
            await fs.writeFile(remoteTotalPath, s.stringify(newRemoteTotal), "utf-8");
            this.remote = newRemoteTotal.rank;
        }

        for (const [index, filename] of filenames.entries()) {
            if (reportProgress) {
                reportProgress(50 + 19 * ((index + 1) / filenames.length), `Summing ${filename}`);
            }
            let newRemoteStats = await s.readJSONFile<s.Stats>(
                path.join(coderankDir, filename),
                s.StatsSchema
            );
            const remoteStatsPath = path.join(repoDir, filename);
            const currRemoteStats = await s.readJSONFile<s.Stats>(remoteStatsPath, s.StatsSchema);
            if (newRemoteStats && currRemoteStats) {
                newRemoteStats = s.sumStats(currRemoteStats, newRemoteStats);
            }

            if (newRemoteStats) {
                await fs.writeFile(remoteStatsPath, s.stringify(newRemoteStats), "utf-8");
            }
        }
    }

    async dumpLocalToRemote(context: ExtensionContext, saveCredentials: boolean): Promise<void> {
        const git = await Git.init(context, saveCredentials);
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
                await this.dumpProjectToLocal();

                try {
                    reportProgress(10, "Writing local total file");
                    await this.writeTotalFile(this.coderankDir);

                    reportProgress(30, `Cloning ${git.repo}`);
                    await git.cloneRepo();

                    await this.addLocalFilesToRemote(
                        this.coderankDir,
                        git.remoteCoderankDir,
                        reportProgress
                    );

                    reportProgress(70, `Pushing to ${git.repo}/${git.branch}`);
                    await git.pushRepo();

                    reportProgress(90, `Removing local files`);
                    await this.deleteCoderankFiles(this.coderankDir);
                    if (saveCredentials) {
                        await git.saveCredentials(context);
                    }

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
