import { ExtensionContext, window, workspace, commands } from "vscode";

import { Coderank } from "./coderank";
import { CoderankStatsProvider } from "./provider";
import { getConfig, Logger } from "./services";

export async function activate(context: ExtensionContext) {
    let config = getConfig();
    const LOG = Logger.getLogger(config.logVerbosity);
    const coderank = await Coderank.init(context);
    await coderank.getMachineRegistry();

    const provider = new CoderankStatsProvider(coderank);
    window.registerTreeDataProvider("coderank", provider);

    context.subscriptions.push(
        workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("coderank")) {
                config = getConfig();
                LOG.verbosity = config.logVerbosity;
                provider.setStats(coderank);
            }
        })
    );

    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            coderank.buffer.updateLanguage(editor);
        })
    );

    context.subscriptions.push(
        workspace.onDidSaveTextDocument(async () => {
            await coderank.pushBuffer();
            provider.setStats(coderank);
        })
    );

    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            coderank.buffer.parseTextDocumentChangeEvent(event);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.pushBuffer", async () => {
            await coderank.pushBuffer({ showMessage: false });
            provider.setStats(coderank);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.pushLocalToRemote", async () => {
            await coderank.pushLocalToRemote(context, {
                options: { saveCredentials: config.saveCredentials },
                autoUpdateWebViewer: config.autoUpdateWebViewer,
            });
            provider.setStats(coderank);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.updateWebViewer", async () => {
            await coderank.pushLocalToRemote(context, {
                options: {
                    saveCredentials: config.saveCredentials,
                    commitMessage: "update web viewer",
                },
                primaryActionMsg: {
                    title: "Updating web viewer in remote repository",
                    progress: "",
                    success: "Successfully updated web viewer in remote repository",
                    failure: "Error updating web viewer in remote repository",
                },
                webViewerOptions: { force: true, showMessage: true, autoUpdate: true },
                treatWebViewerAsPrimaryAction: true,
            });
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.setMachineName", async () => {
            await coderank.setMachineName(context, config);
            provider.setStats(coderank);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.reconfigureMachine", async () => {
            await coderank.reconfigureMachine(context, config);
            provider.setStats(coderank);
        })
    );

    await coderank.autoPush(context, config);
}

export function deactivate() {}
