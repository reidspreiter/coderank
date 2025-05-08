import { promises as fs } from "fs";
import path from "path";

import * as v from "vscode";

import * as s from "../schemas";
import { CODERANK_FILENAME } from "../util";

import { LocalStorage, Buffer, RemoteStorage } from ".";

export class Coderank {
    private constructor(
        private coderankDir: string,
        private coderankFilePath: string,
        private _buffer: Buffer,
        private _local: LocalStorage,
        private _localDisplay: s.CoderankProviderStats = s.CoderankProviderStatsSchema.parse({}),
        private _remoteDisplay: s.CoderankProviderStats = s.CoderankProviderStatsSchema.parse({}),

        // Local and remote data is not known until data has been flushed to local or remote
        // These are used by the provider to ensure the data shown to the user is accurate
        readonly flushedToLocal: boolean = false,
        readonly flushedToRemote: boolean = false
    ) {}

    static async init(context: v.ExtensionContext): Promise<Coderank> {
        const coderankDir = context.globalStorageUri.fsPath;
        const coderankFilePath = path.join(coderankDir, CODERANK_FILENAME);
        const buffer = Buffer.init();
        const local = await LocalStorage.init(context);
        const manager = new Coderank(coderankDir, coderankFilePath, buffer, local);
        return manager;
    }

    get buffer(): Buffer {
        return this._buffer;
    }

    get localDisplay(): s.CoderankProviderStats {
        return this._localDisplay;
    }

    get remoteDisplay(): s.CoderankProviderStats {
        return this._remoteDisplay;
    }

    async flushBuffer(options: { showMessage: boolean } = { showMessage: false }): Promise<void> {
        try {
            this._localDisplay = await this._local.addBuffer(this._buffer);
        } catch (err) {
            v.window.showErrorMessage(`Error dumping project values to local storage: ${err}`);
            return;
        }
        if (options.showMessage) {
            v.window.showInformationMessage(`Saved coderank data to ${this.coderankFilePath}`);
        }
        this._buffer.clear();
    }

    async flushLocalToRemote(context: v.ExtensionContext, saveCredentials: boolean): Promise<void> {
        await v.window.withProgress(
            {
                location: v.ProgressLocation.Notification,
                title: `Flushing local storage to remote repository`,
            },
            async (progress) => {
                const reportProgress = (increment: number, message: string): void => {
                    progress.report({ increment, message });
                };

                reportProgress(0, "Flushing buffer to local storage");
                await this.flushBuffer();

                try {
                    reportProgress(25, `Cloning remote repository`);
                    await RemoteStorage.cloneContext(context, saveCredentials, async (remote) => {
                        reportProgress(50, "Adding local storage to remote");
                        this._remoteDisplay = await remote.addLocalFile(
                            await this._local.readCoderankFile()
                        );

                        reportProgress(70, `Pushing to remote repository`);
                    });
                    reportProgress(90, `Removing local file`);
                    await this._local.clear();
                    this._localDisplay = s.CoderankProviderStatsSchema.parse({});

                    v.window.showInformationMessage(
                        `Succesfully pushed local values to remote repository`
                    );
                } catch (err) {
                    v.window.showErrorMessage(
                        `Error pushing local values to remote repository: ${err}`
                    );
                }
            }
        );
    }
}
