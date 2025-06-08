import { promises as fs } from "fs";
import path from "path";

import { v4 as uuidv4 } from "uuid";
import * as v from "vscode";

import * as s from "../schemas";
import { Config, GitLoginOptions, setConfigValue } from "../services";
import { CODERANK_FILENAME, PUSH_RECORD_FILENAME, MACHINE_REGISTRY_FILENAME } from "../util";

import { LocalStorage, Buffer, RemoteStorage, RemoteFileCallback } from ".";

class MachineItem implements v.QuickPickItem {
    label: string;
    detail: string;

    constructor(
        public id: string,
        public name: string,
        public isCurrentMachine: boolean
    ) {
        this.label = id;
        this.detail = name + (isCurrentMachine ? " (CURRENT)" : "");
    }
}

export class Coderank {
    private constructor(
        private coderankFilePath: string,
        private pushRecordFilePath: string,
        private machineRegistryFilePath: string,
        private _buffer: Buffer,
        private _local: LocalStorage,
        private _localDisplay: s.CoderankProviderStats = s.CoderankProviderStatsSchema.parse({}),
        private _remoteDisplay: s.CoderankProviderStats = s.CoderankProviderStatsSchema.parse({}),
        private _machineDisplay: s.MachineRegistry = s.MachineRegistrySchema.parse({}),

        // Local and remote data is not known until data has been flushed to local or remote
        // These are used by the provider to ensure the data shown to the user is accurate
        private _flushedToLocal: boolean = false,
        private _flushedToRemote: boolean = false
    ) {}

    static async init(context: v.ExtensionContext): Promise<Coderank> {
        const coderankDir = context.globalStorageUri.fsPath;
        const coderankFilePath = path.join(coderankDir, CODERANK_FILENAME);
        const pushRecordFilePath = path.join(coderankDir, PUSH_RECORD_FILENAME);
        const machineRegistryFilePath = path.join(coderankDir, MACHINE_REGISTRY_FILENAME);

        const buffer = Buffer.init();
        const local = await LocalStorage.init(context);
        const coderank = new Coderank(
            coderankFilePath,
            pushRecordFilePath,
            machineRegistryFilePath,
            buffer,
            local
        );
        return coderank;
    }

    get buffer(): Buffer {
        return this._buffer;
    }

    get localDisplay(): s.CoderankProviderStats {
        return { ...this._localDisplay };
    }

    get remoteDisplay(): s.CoderankProviderStats {
        return { ...this._remoteDisplay };
    }

    get machineDisplay(): s.MachineRegistry {
        return { ...this._machineDisplay };
    }

    get flushedToLocal(): boolean {
        return this._flushedToLocal;
    }

    get flushedToRemote(): boolean {
        return this._flushedToRemote;
    }

    async getMachineRegistry(): Promise<s.MachineRegistry> {
        const machineRegistry =
            (await s.readJSONFile(this.machineRegistryFilePath, s.MachineRegistrySchema)) ||
            s.MachineRegistrySchema.parse({});
        if (machineRegistry.id.length === 0) {
            machineRegistry.id = uuidv4();
            machineRegistry.inRemote = false;
            await this.setMachineRegistry(machineRegistry);
        }
        this._machineDisplay = machineRegistry;
        return machineRegistry;
    }

    async setMachineRegistry(registry: s.MachineRegistry) {
        this._machineDisplay = registry;
        await fs.writeFile(this.machineRegistryFilePath, s.stringify(registry), "utf-8");
    }

    async getPushRecord(): Promise<s.PushRecord | null> {
        return await s.readJSONFile(this.pushRecordFilePath, s.PushRecordSchema);
    }

    async setPushRecord(record: s.PushRecord) {
        await fs.writeFile(this.pushRecordFilePath, s.stringify(record), "utf-8");
    }

    async pushBuffer(options: { showMessage: boolean } = { showMessage: false }): Promise<void> {
        try {
            this._localDisplay = await this._local.addBuffer(
                this._buffer,
                await this.getMachineRegistry()
            );
        } catch (err) {
            v.window.showErrorMessage(`Error dumping project values to local storage: ${err}`);
            return;
        }
        if (options.showMessage) {
            v.window.showInformationMessage(`Saved coderank data to ${this.coderankFilePath}`);
        }
        this._buffer.clear();
        this._flushedToLocal = true;
    }

    async pushLocalToRemote(
        context: v.ExtensionContext,
        {
            options = {},
            primaryActionCallback,
            primaryActionMsg = {
                title: "Pushing local storage to remote repository",
                progress: "Performing primary action",
                success: "Successfully pushed local values to remote repository",
                failure: "Error pushing local values to remote repository",
            },
            webViewerOptions = {
                autoUpdate: true,
                showMessage: false,
                force: false,
            },
            autoUpdateWebViewer = true,
            treatWebViewerAsPrimaryAction = false,
        }: {
            options?: Partial<GitLoginOptions>;
            primaryActionCallback?: RemoteFileCallback;
            primaryActionMsg?: {
                title: string;
                progress: string;
                success: string;
                failure: string;
            };
            webViewerOptions?: { showMessage: boolean; force: boolean; autoUpdate: boolean };
            autoUpdateWebViewer?: boolean;
            treatWebViewerAsPrimaryAction?: boolean;
        } = {}
    ): Promise<boolean> {
        let aborted = false;
        let newRemoteDisplay = s.CoderankProviderStatsSchema.parse({});
        let pushRecord = (await this.getPushRecord()) || s.PushRecordSchema.parse({});

        if (pushRecord.activePush) {
            const result = await v.window.showWarningMessage(
                "A Coderank push process may be running in another VS Code window or VS Code may have been closed while a push process was running.",
                { modal: false },
                "Push anyway",
                "Cancel push"
            );

            if (result !== "Push anyway") {
                return true;
            }
        }
        pushRecord.activePush = true;
        await this.setPushRecord(pushRecord);

        await v.window.withProgress(
            {
                location: v.ProgressLocation.Notification,
                title: primaryActionMsg.title,
            },
            async (progress) => {
                const reportProgress = (increment: number, message: string): void => {
                    progress.report({ increment, message });
                };

                reportProgress(0, "Adding buffer to local storage");
                await this.pushBuffer();

                try {
                    reportProgress(25, `Cloning remote repository`);
                    aborted = await RemoteStorage.cloneContext(
                        context,
                        async (remote) => {
                            reportProgress(40, "Adding local storage to remote");
                            newRemoteDisplay = await remote.addLocalFile(
                                this._local,
                                await this.getMachineRegistry(),
                                (registry) => this.setMachineRegistry(registry)
                            );

                            if (
                                autoUpdateWebViewer &&
                                (await remote.shouldUpdateWebRecord(webViewerOptions))
                            ) {
                                reportProgress(50, "Updating web viewer");
                                const webViewerAborted =
                                    await remote.updateWebViewer(webViewerOptions);
                                if (webViewerAborted && treatWebViewerAsPrimaryAction) {
                                    aborted = true;
                                    return true;
                                }
                            }

                            if (primaryActionCallback !== undefined) {
                                reportProgress(60, primaryActionMsg.progress);
                                aborted = await remote.updateData(primaryActionCallback);
                                if (aborted) {
                                    return true;
                                }
                            }

                            reportProgress(70, "Pushing to remote repository");
                            return false;
                        },
                        options
                    );

                    if (aborted) {
                        v.window.showInformationMessage("Applied no changes");
                        return;
                    }

                    reportProgress(90, "Removing local file");
                    await this._local.clear();
                    this._localDisplay = s.CoderankProviderStatsSchema.parse({});
                    this._remoteDisplay = newRemoteDisplay;
                    this._flushedToRemote = true;

                    v.window.showInformationMessage(primaryActionMsg.success);
                } catch (err) {
                    v.window.showErrorMessage(`${primaryActionMsg.failure}: ${err}`);
                    aborted = true;
                }
            }
        );

        if (aborted) {
            pushRecord.activePush = false;
            await this.setPushRecord(pushRecord);
        } else {
            pushRecord = s.getCurrentPushRecord(pushRecord.askedToSaveCredentials);
            await this.setPushRecord(pushRecord);
        }

        if (!(aborted || pushRecord.askedToSaveCredentials || options.saveCredentials)) {
            const result = await v.window.showInformationMessage(
                "Would you like coderank to save your GitHub username and PAT?\n\nThis can be modified later by toggling coderank.saveCredentials.\n\nIt is recommended to scope your PAT to your coderank repository only to avoid potential security issues with VS Code's secret storage: https://cycode.com/blog/exposing-vscode-secrets/",
                { modal: false },
                "Yes",
                "No",
            );
            if (result === "Yes") {
                await setConfigValue("saveCredentials", true);
            }
            pushRecord.askedToSaveCredentials = true;
            await this.setPushRecord(pushRecord);
        }
        return aborted;
    }

    async autoPush(context: v.ExtensionContext, config: Config) {
        if (config.pushReminderFrequency === "never") {
            return;
        }

        const prevPushRecord = await this.getPushRecord();

        // Most likely the first time the user has activated the extension
        // Write initial push record so they will be reminded the next time a push is overdue
        if (prevPushRecord === null) {
            await this.setPushRecord(s.getCurrentPushRecord(false));
            return;
        }

        if (prevPushRecord.activePush) {
            return;
        }

        const currPushRecord = s.getCurrentPushRecord();
        const isDaily = config.pushReminderFrequency.startsWith("daily");
        const isWeekly = config.pushReminderFrequency.startsWith("weekly");
        const shouldAutoPush =
            (isDaily && !s.shallowEqual(currPushRecord, prevPushRecord)) ||
            (isWeekly &&
                (currPushRecord.week !== prevPushRecord.week ||
                    currPushRecord.year !== prevPushRecord.year));

        if (shouldAutoPush) {
            if (!config.pushReminderFrequency.endsWith("force")) {
                const result = await v.window.showInformationMessage(
                    `Your coderank data has not been successfully pushed in more than one ${isDaily ? "day" : "week"}. Would you like to push now?`,
                    { modal: false },
                    "Yes",
                    "No",
                    "Don't show this again"
                );
                if (result !== "Yes") {
                    if (result === "Don't show this again") {
                        await setConfigValue("pushReminderFrequency", "never");
                    }
                    return;
                }
            }

            await this.pushLocalToRemote(context, {
                options: { saveCredentials: config.saveCredentials },
                primaryActionMsg: {
                    title: `Completing auto push for frequency ${config.pushReminderFrequency}`,
                    progress: "Completing auto push",
                    success: `Succesfully completed auto push for frequency ${config.pushReminderFrequency}`,
                    failure: `Error completing auto push for frequency ${config.pushReminderFrequency}`,
                },
                autoUpdateWebViewer: config.autoUpdateWebViewer,
            });
        }
    }

    async setMachineName(context: v.ExtensionContext, config: Config) {
        let newMachineName: string | undefined = undefined;
        const aborted = await this.pushLocalToRemote(context, {
            options: {
                saveCredentials: config.saveCredentials,
                commitMessage: "change machine name",
            },
            primaryActionCallback: async (remoteFile) => {
                const { name: oldName, id } = await this.getMachineRegistry();
                newMachineName = await v.window.showInputBox({
                    prompt: "Enter the new name for this machine",
                    placeHolder: "MyMachine",
                    value: oldName,
                    ignoreFocusOut: true,
                });

                if (!newMachineName) {
                    return null;
                }

                s.updateMachineField(remoteFile, id, "name", newMachineName);
                return remoteFile;
            },
            primaryActionMsg: {
                title: "Changing Machine Name",
                progress: "Changing machine name",
                success: "Successfully changed machine name",
                failure: "Error changing machine name",
            },
            autoUpdateWebViewer: config.autoUpdateWebViewer,
        });

        if (!aborted && newMachineName) {
            const machineRegistry = await this.getMachineRegistry();
            machineRegistry.name = newMachineName;
            await this.setMachineRegistry(machineRegistry);
        }
    }

    async reconfigureMachine(context: v.ExtensionContext, config: Config) {
        const { name: oldName, id: oldID } = await this.getMachineRegistry();
        let newMachineRegistry: s.MachineRegistry | undefined = undefined;

        const aborted = await this.pushLocalToRemote(context, {
            options: {
                saveCredentials: config.saveCredentials,
                commitMessage: `reconfigure machine '${oldName}'`,
            },
            primaryActionCallback: async (remoteFile) => {
                const existingMachineItems: MachineItem[] = [
                    new MachineItem(
                        "Abort",
                        `WARNING: reconfiguring ${oldName} (CURRENT) causes its data to be combined with the selected machine.\nThis is irreversible and you may wish to abort this operation.\nThis is useful if you uninstalled and reinstalled VS Code on the same machine, causing Coderank to initialize a new machine reference even though one already exists in the remote repository.`,
                        false
                    ),
                ];

                for (const year in remoteFile.years) {
                    for (const machine in remoteFile.years[year].machines) {
                        existingMachineItems.push(
                            new MachineItem(
                                machine,
                                remoteFile.years[year].machines[machine].name,
                                machine === oldID
                            )
                        );
                    }
                }

                const newMachineItem = await v.window.showQuickPick(existingMachineItems, {
                    placeHolder: `Choose an available machine to reconfigure to...`,
                    title: "Select New Machine",
                    ignoreFocusOut: true,
                });

                if (
                    newMachineItem === undefined ||
                    newMachineItem.isCurrentMachine ||
                    newMachineItem.id === "Abort"
                ) {
                    return null;
                }

                remoteFile = s.reconfigureMachine(
                    remoteFile,
                    newMachineItem.id,
                    newMachineItem.name,
                    oldID
                );
                newMachineRegistry = s.MachineRegistrySchema.parse({
                    ...newMachineItem,
                    inRemote: true,
                });
                return remoteFile;
            },
            primaryActionMsg: {
                title: "Reconfiguring Machine",
                progress: "Combining machine data",
                success: "Successfully reconfigured machine",
                failure: "Error reconfiguring machine",
            },
            autoUpdateWebViewer: config.autoUpdateWebViewer,
        });

        if (!aborted && newMachineRegistry) {
            await this.setMachineRegistry(newMachineRegistry);
        }
    }
}
