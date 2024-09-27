import { ExtensionContext, window, workspace, commands } from "vscode";

import { getConfig } from "./config";
import { CoderankStatsProvider } from "./provider";
import { Stats } from "./stats";

export async function activate(context: ExtensionContext) {
    let config = getConfig();

    const stats = new Stats(context);
    if (config.loadLocalOnStart && config.mode !== "project") {
        await stats.loadLocal();
    }

    const provider = new CoderankStatsProvider(config, stats);
    window.registerTreeDataProvider("coderank", provider);

    context.subscriptions.push(
        workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("coderank")) {
                config = getConfig();
                provider.setStats(config, stats);
            }
        })
    );

    context.subscriptions.push(
        workspace.onDidSaveTextDocument(async () => {
            if (config.mode !== "project" && config.autoStore) {
                await stats.dumpProjectToLocal(config.mode);
                provider.setStats(config, stats);
            }
        })
    );

    // Use counter instead of modulo to avoid clamping the buffer to be divisible by the refresh rate.
    // If the user manually refreshes, refresh x characters from that point.
    let refreshCounter = 0;
    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            // Do not track non-code events like saving the document and console output
            if (!event.contentChanges || event.document.uri.scheme === "output") {
                return;
            }

            if (config.debug) {
                console.debug(event);
            }

            event.contentChanges.forEach((change) => {
                const length = change.rangeLength || change.text.length;

                // if rangeLength is not 0, a mass content deletion the size of rangeLength occured
                if (change.rangeLength) {
                    stats.project.deleted += length;
                } else {
                    stats.project.added += length;
                    if (config.trackChars) {
                        stats.project.chars.mapText(change.text);
                    }
                }
                refreshCounter += length;
            });

            stats.project.total = stats.project.added - stats.project.deleted;
            stats.project.rankBuffer++;

            if (config.refreshRate !== 0) {
                if (refreshCounter >= config.refreshRate) {
                    refreshCounter = 0;
                    stats.updateProjectRank();
                    provider.setFields(stats.project, "project", config.trackChars);
                }
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.refreshProject", () => {
            refreshCounter = 0;
            stats.updateProjectRank();
            provider.setFields(stats.project, "project", config.trackChars);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.dumpProjectToLocal", async () => {
            if (config.mode !== "project") {
                await stats.dumpProjectToLocal(config.mode, false);
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
                stats.dumpLocalToRemote(context);
            } else {
                window.showErrorMessage(
                    `'coderank.mode' is set to '${config.mode}': set to 'remote' to access remote repository`
                );
            }
        })
    );
}

export function deactivate() {}
