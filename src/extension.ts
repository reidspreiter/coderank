import { ExtensionContext, window, workspace, commands } from "vscode";
import { getConfig } from "./config";
import { Stats } from "./stats";
import { CoderankStatsProvider } from "./provider";

export async function activate(context: ExtensionContext) {
    let config = getConfig();

    const stats = new Stats();
    if (config.loadLocalOnStartup && config.mode !== "project") {
        await stats.loadLocal(context);
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
            if (config.mode !== "project" && config.autoStoreLocallyOnDocumentSave) {
                await stats.dumpProjectToLocal(context, config.mode);
                provider.setStats(config, stats);
            }
        })
    );

    // Use counter instead of modulo to avoid clamping the buffer to be divisible by the refresh rate.
    // If the user manually refreshes, refresh x characters from that point.
    let countSinceLastRefresh = 0;
    let countSinceLastCharacterRefresh = 0;
    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            // Do not track non-code events like saving the document
            if (!event.contentChanges) {
                return;
            }

            let refreshCounterIncrease = 0;

            event.contentChanges.forEach((change) => {
                const length = change.rangeLength || change.text.length;

                // if rangeLength is not 0, a mass content deletion the size of rangeLength occured
                if (change.rangeLength) {
                    stats.project.deleted += length;
                } else {
                    stats.project.added += length;
                    if (config.trackChars) {
                        stats.project.chars.input(change.text);
                    }
                }
                refreshCounterIncrease += length;
            });

            stats.project.total = stats.project.added - stats.project.deleted;
            stats.project.rankBuffer++;

            if (config.refreshRate !== 0) {
                countSinceLastRefresh += refreshCounterIncrease;
                if (countSinceLastRefresh >= config.refreshRate) {
                    countSinceLastRefresh = 0;
                    stats.updateProjectRank();
                    provider.setFields(stats.project, "project");
                }
            }

            if (config.charRefreshRate !== 0 && config.trackChars) {
                countSinceLastCharacterRefresh += refreshCounterIncrease;
                if (countSinceLastCharacterRefresh >= config.charRefreshRate) {
                    countSinceLastCharacterRefresh = 0;
                    provider.setFields(stats.project, "project", "refreshCharDataOnly");
                }
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.refreshProject", () => {
            countSinceLastCharacterRefresh = 0;
            countSinceLastRefresh = 0;
            stats.updateProjectRank();
            if (config.trackChars) {
                provider.setFields(stats.project, "project", "refreshAll");
            } else {
                provider.setFields(stats.project, "project");
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.storeProjectValues", async () => {
            if (config.mode !== "project") {
                await stats.dumpProjectToLocal(context, config.mode, false);
                provider.setStats(config, stats);
            } else {
                window.showErrorMessage(
                    "'coderank.mode' is set to 'project', set to 'local' to access local storage"
                );
            }
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.loadBackup", async () => {
            if (config.mode === "local") {
                stats.loadBackup(context);
            } else {
                window.showErrorMessage("Backups are only created and loadable in local mode.");
            }
        })
    );
}

export function deactivate() {}
