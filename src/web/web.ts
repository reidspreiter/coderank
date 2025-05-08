import * as v from "vscode";

import { RemoteStorage } from "../coderank";

export async function updateWebViewer(
    context: v.ExtensionContext,
    saveCredentials: boolean
): Promise<void> {
    await v.window.withProgress(
        {
            location: v.ProgressLocation.Notification,
            title: `Updating web viewer in remote repository`,
        },
        async (progress) => {
            const reportProgress = (increment: number, message: string): void => {
                progress.report({ increment, message });
            };
            try {
                reportProgress(0, `Cloning remote repository`);
                await RemoteStorage.cloneContext(context, saveCredentials, async (remote) => {
                    reportProgress(40, "Updating web viewer files");
                    await remote.updateWebViewer({ showMessage: true, force: true });
                    reportProgress(70, `Pushing to remote repository`);
                });
                v.window.showInformationMessage(
                    `Succesfully updated web viewer in remote repository`
                );
            } catch (err) {
                v.window.showErrorMessage(`Error updating web viewer: ${err}`);
            }
        }
    );
}
