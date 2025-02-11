import { promises as fs } from "fs";
import path from "path";

import { ExtensionContext, window, ProgressLocation, TextEditor } from "vscode";

import { Git, Logger } from "./services";
import * as s from "./shemas";
import { getYear, getWeek, RANK_INCREMENT, CODERANK_FILENAME } from "./util";

const logger = Logger.getLogger();

export class StatsManager {
    private constructor(
        private coderankDir: string,
        private coderankFilePath: string,
        private currLanguage: string,
        private machine: string,
        private project: string,
        private week: string,
        private year: string,
        private buffer: s.CoderankBuffer,
        private local: s.CoderankProviderStats,
        private remote: s.CoderankProviderStats,

        // Local and remote data is not known until data has been flushed to local or remote
        // These are used by the provider to ensure the data shown to the user is accurate
        readonly flushedToLocal: boolean = false,
        readonly flushedToRemote: boolean = false
    ) {}

    static async init(context: ExtensionContext, editor?: TextEditor): Promise<StatsManager> {
        // This may not be necessary,
        // but the fsPath did not exist the first time the extension was used
        await fs.mkdir(context.globalStorageUri.fsPath, { recursive: true });

        const coderankDir = context.globalStorageUri.fsPath;
        const coderankFilePath = path.join(coderankDir, CODERANK_FILENAME);
        const week = getWeek();
        const year = getYear();
        const buffer = s.CoderankBufferSchema.parse({});
        const local = s.CoderankProviderStatsSchema.parse({});
        const remote = s.CoderankProviderStatsSchema.parse({});
        const currLanguage = "unknown",
            machine = "unknown",
            project = "unknown";
        const manager = new StatsManager(
            coderankDir,
            coderankFilePath,
            currLanguage,
            machine,
            project,
            week,
            year,
            buffer,
            local,
            remote
        );
        manager.updateLanguage(editor);
        return manager;
    }

    get localStats(): s.CoderankProviderStats {
        return this.local;
    }

    get remoteStats(): s.CoderankProviderStats {
        return this.remote;
    }

    handleDeletion(deleted: number): void {
        if (!(this.currLanguage in this.buffer.languages)) {
            this.buffer.languages[this.currLanguage] = s.MainStatsCharsSchema.parse({});
        }
        const language = this.buffer.languages[this.currLanguage];

        this.buffer.deleted += deleted;
        language.deleted += deleted;
        this.buffer.rank += RANK_INCREMENT;
        language.rank += RANK_INCREMENT;

        if (deleted > 1) {
            this.buffer.deleted_cut += deleted;
            language.deleted_cut += deleted;
            this.buffer.num_cuts++;
            language.num_cuts++;
        } else {
            this.buffer.deleted_typed++;
            language.deleted_typed++;
        }
    }

    handleAddition(added: number, chars: string): void {
        if (!(this.currLanguage in this.buffer.languages)) {
            this.buffer.languages[this.currLanguage] = s.MainStatsCharsSchema.parse({});
        }
        const language = this.buffer.languages[this.currLanguage];

        this.buffer.added += added;
        language.added += added;
        this.buffer.rank += RANK_INCREMENT;
        language.rank += RANK_INCREMENT;
        this.buffer.chars = s.parseStringToCharMap(chars, this.buffer.chars);
        language.chars = s.parseStringToCharMap(chars, language.chars);

        if (added > 1) {
            this.buffer.added_pasted += added;
            language.added_pasted += added;
            this.buffer.num_pastes++;
            language.num_pastes++;
        } else {
            this.buffer.added_typed++;
            language.added_typed++;
        }
    }

    updateLanguage(editor: TextEditor | undefined): void {
        let language = "unknown";
        if (editor) {
            language = editor.document.languageId;
        }
        logger.log(`Detected new language: ${language}`);
        this.currLanguage = language;
    }

    private async readLocalStorage(): Promise<s.CoderankLocalFile> {
        let stats = await s.readJSONFile<s.CoderankLocalFile>(
            this.coderankFilePath,
            s.CoderankLocalFileSchema
        );
        return stats || s.CoderankLocalFileSchema.parse({});
    }

    private async deleteLocalStorage(): Promise<void> {
        await fs.rm(this.coderankFilePath);
        this.local = s.CoderankProviderStatsSchema.parse({});
    }

    async flushBuffer(options: { showMessage: boolean } = { showMessage: false }): Promise<void> {
        const bufferCopy = this.buffer;
        this.buffer = s.CoderankBufferSchema.parse({});

        try {
            let localFile = await this.readLocalStorage();
            localFile = s.sumBufferToLocalFile(
                localFile,
                bufferCopy,
                this.year,
                this.machine,
                this.project
            );

            await fs.writeFile(this.coderankFilePath, s.stringify(localFile), "utf-8");

            this.local = s.CoderankProviderStatsSchema.parse(localFile);
            if (options.showMessage) {
                window.showInformationMessage(`Saved coderank data to ${this.coderankFilePath}`);
            }
        } catch (err) {
            this.buffer = bufferCopy;
            window.showErrorMessage(`Error dumping project values to local storage: ${err}`);
        }
    }

    async flushLocalToRemote(context: ExtensionContext, saveCredentials: boolean): Promise<void> {
        await Git.login_context(context, saveCredentials, async (git) => {
            await window.withProgress(
                {
                    location: ProgressLocation.Notification,
                    title: `Pushing local values to ${git.repo}`,
                },
                async (progress) => {
                    const reportProgress = (increment: number, message: string): void => {
                        progress.report({ increment, message });
                    };

                    reportProgress(0, "Flushing buffer to local storage");
                    await this.flushBuffer();

                    try {
                        reportProgress(25, `Cloning ${git.repo}`);
                        await git.cloneRepo();

                        reportProgress(50, "Flushing local storage to remote repository");
                        const localFile = await this.readLocalStorage();
                        let remoteFile = await s.readJSONFile<s.CoderankRemoteFile>(
                            git.remoteCoderankFile,
                            s.CoderankRemoteFileSchema
                        );
                        remoteFile = s.sumLocalFileToRemoteFile(
                            remoteFile || s.CoderankRemoteFileSchema.parse({}),
                            localFile
                        );
                        await fs.writeFile(
                            git.remoteCoderankFile,
                            s.stringify(remoteFile),
                            "utf-8"
                        );

                        reportProgress(70, `Pushing to ${git.repoAndBranch}`);
                        await git.pushRepo();

                        reportProgress(90, `Removing local file`);
                        await this.deleteLocalStorage();

                        this.local = s.CoderankProviderStatsSchema.parse({});
                        this.remote = s.CoderankProviderStatsSchema.parse(remoteFile);

                        window.showInformationMessage(
                            `Succesfully pushed local values to ${git.repoAndBranch}`
                        );
                    } catch (err) {
                        window.showErrorMessage(
                            `Error pushing local values to remote repository: ${err}`
                        );
                    }
                }
            );
        });
    }
}
