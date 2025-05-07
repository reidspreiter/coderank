import { ExtensionContext, window, workspace, commands } from "vscode";

import { Coderank } from "./coderank";
import { CoderankStatsProvider } from "./provider";
import { getConfig, Logger } from "./services";
import { updateWebViewer } from "./web";

export async function activate(context: ExtensionContext) {
    let config = getConfig();
    const LOG = Logger.getLogger(config.debug);
    const coderank = await Coderank.init(context);

    const provider = new CoderankStatsProvider(coderank);
    window.registerTreeDataProvider("coderank", provider);

    context.subscriptions.push(
        workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("coderank")) {
                const debug = config.debug;
                config = getConfig();

                if (debug !== config.debug) {
                    if (config.debug) {
                        LOG.show();
                    } else {
                        LOG.hide();
                    }
                }
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
            if (config.autoStore) {
                await coderank.flushBuffer();
                provider.setStats(coderank);
            }
        })
    );

    context.subscriptions.push(
        workspace.onDidChangeTextDocument((event) => {
            coderank.buffer.parseTextDocumentChangeEvent(event);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.flushBuffer", async () => {
            await coderank.flushBuffer({ showMessage: false });
            provider.setStats(coderank);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.flushLocalToRemote", async () => {
            coderank.flushLocalToRemote(context, config.saveCredentials);
            provider.setStats(coderank);
        })
    );

    context.subscriptions.push(
        commands.registerCommand("coderank.updateWebViewer", async () => {
            updateWebViewer(context, config.saveCredentials);
        })
    );
}

export function deactivate() { }
