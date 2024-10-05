import path from "path";

import { ExtensionContext, window, workspace, commands } from "vscode";

import { CoderankStatsProvider } from "./provider";
import { getConfig, Logger } from "./services";
import { StatsManager } from "./stats";

export type EventStatus = "normal" | "git" | "conflict";

export async function activate(context: ExtensionContext) {
    let config = getConfig();
    const logger = Logger.getLogger();
    if (config.debug) {
        logger.show();
    }

    const stats = new StatsManager(context);
    stats.updateLanguage(window.activeTextEditor);

    if (config.loadLocalOnStart && config.mode !== "project") {
        await stats.loadLocal();
    }

    const provider = new CoderankStatsProvider(config, stats);
    window.registerTreeDataProvider("coderank", provider);

    context.subscriptions.push(
        workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("coderank")) {
                const debug = config.debug;
                config = getConfig();

                if (debug !== config.debug) {
                    if (config.debug) {
                        logger.show();
                    } else {
                        logger.hide();
                    }
                }
                provider.setStats(config, stats);
            }
        })
    );

    context.subscriptions.push(window.onDidChangeActiveTextEditor(stats.updateLanguage));

    context.subscriptions.push(
        workspace.onDidSaveTextDocument(async () => {
            if (config.mode !== "project" && config.autoStore) {
                await stats.dumpProjectToLocal();
                provider.setStats(config, stats);
            }
        })
    );

    let refreshCounter = 0;
    let status: EventStatus = "normal";
    const conflictRegex = /<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> .*?/s;
    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            const scheme = event.document.uri.scheme;
            if (scheme === "output") {
                // logger scheme is "output", do this to avoid endless loop
                return;
            }

            logger.logTextDocumentChange(event, status);

            // Do not track non-code events like saving the document or console output
            const filename = path.basename(event.document.fileName);
            if (event.contentChanges.length === 0 || scheme !== "file") {
                if (scheme === "git") {
                    status = "git";
                }
                return;
            }

            if (filename === "COMMIT_EDITMSG" || filename === "git-rebase-todo") {
                status = "git";
                return;
            }

            if (status === "conflict") {
                return;
            } else if (status === "git") {
                const change = event.contentChanges[0];
                if (change.text.length === 0) {
                    if (change.rangeLength !== 1) {
                        return;
                    }
                } else {
                    const { start, end } = change.range;
                    if (end.line - start.line !== 0 || end.character - start.character !== 0) {
                        return;
                    }
                }
                status = "normal";
            }

            const changes = event.contentChanges.length;
            const change = event.contentChanges[0];

            // rangeLength tracks the amount of deleted characters
            const length = change.text.length || change.rangeLength;

            if (change.text.length) {
                if (change.text.match(conflictRegex)) {
                    status = "conflict";
                    return;
                }
                const { start, end } = change.range;
                if (end.line - start.line !== 0 || end.character - start.character !== 0) {
                    return;
                }
                const chars = config.trackChars ? change.text.repeat(changes) : "";
                stats.handleAddition(length * changes, chars);
            } else {
                stats.handleDeletion(length * changes);
            }
            refreshCounter += length;

            if (config.refreshRate !== 0) {
                if (refreshCounter >= config.refreshRate) {
                    refreshCounter = 0;
                    provider.setFields(stats.project, "project", config.trackChars);
                }
            } else {
                refreshCounter = 0;
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.refreshProject", () => {
            refreshCounter = 0;
            provider.setFields(stats.project, "project", config.trackChars);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.dumpProjectToLocal", async () => {
            if (config.mode !== "project") {
                await stats.dumpProjectToLocal(false);
                provider.setStats(config, stats);
            } else {
                window.showErrorMessage(
                    `'coderank.mode' is set to '${config.mode}': set to 'local' or 'remote' to access local storage`
                );
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.loadBackup", async () => {
            if (config.mode !== "project") {
                stats.loadBackup();
            } else {
                window.showErrorMessage(
                    `'coderank.mode' is set to '${config.mode}': set to 'local' or 'remote' to create and load backups`
                );
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.dumpLocalToRemote", async () => {
            if (config.mode === "remote") {
                stats.dumpLocalToRemote(context, config.saveCredentials);
            } else {
                window.showErrorMessage(
                    `'coderank.mode' is set to '${config.mode}': set to 'remote' to access remote repository`
                );
            }
        })
    );
}

export function deactivate() {}
