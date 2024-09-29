import path from "path";

import { ExtensionContext, window, workspace, commands } from "vscode";

import { Stats } from "./models";
import { CoderankStatsProvider } from "./provider";
import { getConfig, Logger } from "./services";

export async function activate(context: ExtensionContext) {
    let config = getConfig();
    const logger = Logger.getLogger(config.debug);

    const stats = new Stats(context);
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

    context.subscriptions.push(
        workspace.onDidSaveTextDocument(async () => {
            if (config.mode !== "project" && config.autoStore) {
                await stats.dumpProjectToLocal();
                provider.setStats(config, stats);
            }
        })
    );

    // Use counter instead of modulo to avoid clamping the buffer to be divisible by the refresh rate.
    // If the user manually refreshes, refresh x characters from that point.
    let refreshCounter = 0;
    let gitActive = false;
    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            const scheme = event.document.uri.scheme;
            if (scheme !== "output") {
                logger.logTextDocumentChange(event, gitActive);
            }

            // Do not track non-code events like saving the document or console output
            const filename = path.basename(event.document.fileName);
            if (
                event.contentChanges.length === 0 ||
                scheme !== "file" ||
                filename === "COMMIT_EDITMSG" ||
                filename === "git-rebase-todo"
            ) {
                // Git actions in VS Code involve deleting entire file contents, pasting
                // the entirety of new changes, and more. Do not accept any events after
                // a git scheme is found until a single character is added or deleted
                if (
                    scheme === "git" ||
                    filename === "COMMIT_EDITMSG" ||
                    filename === "git-rebase-todo"
                ) {
                    gitActive = true;
                }
                return;
            }

            if (gitActive) {
                const change = event.contentChanges[0];
                if (
                    (change.rangeLength === 1 && change.text.length === 0) ||
                    (change.rangeLength === 0 && change.text.length === 1)
                ) {
                    gitActive = false;
                } else {
                    return;
                }
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
