import { promises as fs } from "fs";
import path from "path";

import { v4 as uuidv4 } from "uuid";
import * as v from "vscode";

import * as s from "../schemas";
import { Config, GitLoginOptions, setConfigValue } from "../services";
import { CODERANK_FILENAME, AUTOPUSH_RECORD_FILENAME, MACHINE_REGISTRY_FILENAME } from "../util";

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
        this.detail = name + isCurrentMachine ? " (CURRENT)" : "";
    }
}

export class Coderank {
    private constructor(
        private coderankFilePath: string,
        private autoPushRecordFilePath: string,
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
        const autoPushRecordFilePath = path.join(coderankDir, AUTOPUSH_RECORD_FILENAME);
        const machineRegistryFilePath = path.join(coderankDir, MACHINE_REGISTRY_FILENAME);

        const buffer = Buffer.init();
        const local = await LocalStorage.init(context);
        const manager = new Coderank(
            coderankFilePath,
            autoPushRecordFilePath,
            machineRegistryFilePath,
            buffer,
            local
        );
        return manager;
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
            await fs.writeFile(this.machineRegistryFilePath, s.stringify(machineRegistry), "utf-8");
        }
        this._machineDisplay = machineRegistry;
        return machineRegistry;
    }

    async setMachineRegistry(registry: s.MachineRegistry) {
        await fs.writeFile(this.machineRegistryFilePath, s.stringify(registry), "utf-8");
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
        options: Partial<GitLoginOptions> = {},
        primaryActionCallback?: RemoteFileCallback,
        primaryActionTitle: string = "Pushing local storage to remote repository",
        primaryActionProgressMessage: string = "Performing primary action",
        primaryActionSuccessMessage: string = "Successfully pushed local values to remote repository",
        primaryActionFailureMessage: string = "Error pushing local values to remote repository",
        webViewerOptions: { showMessage: boolean; force: boolean } = {
            showMessage: false,
            force: false,
        }
    ): Promise<boolean> {
        let aborted = false;
        let newRemoteDisplay = s.CoderankProviderStatsSchema.parse({});
        await v.window.withProgress(
            {
                location: v.ProgressLocation.Notification,
                title: primaryActionTitle,
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
                                this.setMachineRegistry
                            );

                            if (await remote.shouldUpdateWebRecord(webViewerOptions)) {
                                reportProgress(50, "Updating web viewer");
                                remote.updateWebViewer(webViewerOptions);
                            }

                            if (primaryActionCallback !== undefined) {
                                reportProgress(60, primaryActionProgressMessage);
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

                    await fs.writeFile(
                        this.autoPushRecordFilePath,
                        s.stringify(s.getCurrentAutoPushRecord()),
                        "utf-8"
                    );

                    reportProgress(90, `Removing local file`);
                    await this._local.clear();
                    this._localDisplay = s.CoderankProviderStatsSchema.parse({});
                    this._remoteDisplay = newRemoteDisplay;
                    this._flushedToRemote = true;

                    v.window.showInformationMessage(primaryActionSuccessMessage);
                } catch (err) {
                    v.window.showErrorMessage(`${primaryActionFailureMessage}: ${err}`);
                    aborted = true;
                }
            }
        );
        return aborted;
    }

    async autoPush(context: v.ExtensionContext, config: Config) {
        if (config.pushReminderFrequency === "never") {
            return;
        }

        const prevPushRecord = await s.readJSONFile(
            this.autoPushRecordFilePath,
            s.AutoPushRecordSchema
        );

        // Most likely the first time the user has activated the extension
        // Write initial push record so they will be reminded the next time a push is overdue
        if (prevPushRecord === null) {
            await fs.writeFile(
                this.autoPushRecordFilePath,
                s.stringify(s.getCurrentAutoPushRecord()),
                "utf-8"
            );
            return;
        }

        const currPushRecord = s.getCurrentAutoPushRecord();
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
                    `Your coderank data has not been pushed in more than one ${isDaily ? "day" : "week"}. Would you like to push now?`,
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

            await this.pushLocalToRemote(context, { saveCredentials: config.saveCredentials });
        }
    }

    async setMachineName(context: v.ExtensionContext, config: Config) {
        let newMachineName: string | undefined = undefined;
        const aborted = await this.pushLocalToRemote(
            context,
            {
                saveCredentials: config.saveCredentials,
                commitMessage: "changed machine name",
            },
            async (remoteFile) => {
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
            "Changing Machine Name",
            "Changing machine name",
            "Successfully changed machine name",
            "Error changing machine name"
        );

        if (!aborted && newMachineName) {
            const machineRegistry = await this.getMachineRegistry();
            machineRegistry.name = newMachineName;
            await this.setMachineRegistry(machineRegistry);
        }
    }

    async reconfigureMachine(context: v.ExtensionContext, config: Config) {
        const { name: oldName, id: oldID } = await this.getMachineRegistry();
        let newMachineRegistry: s.MachineRegistry | undefined = undefined;

        const aborted = await this.pushLocalToRemote(
            context,
            {
                saveCredentials: config.saveCredentials,
                commitMessage: `reconfigured machine '${oldName}'`,
            },
            async (remoteFile) => {
                const existingMachineItems: MachineItem[] = [
                    new MachineItem("Abort", "Abort this operation", false),
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
                    placeHolder: `WARNING: ${oldName} (CURRENT) will be combined and replaced with the selected machine. This is irreversible.`,
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
            "Reconfiguring Machine",
            "Combining machine data",
            "Successfully reconfigured machine",
            "Error reconfiguring machine"
        );

        if (!aborted && newMachineRegistry) {
            await this.setMachineRegistry(newMachineRegistry);
        }
    }
}
