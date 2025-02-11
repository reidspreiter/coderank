import { promises as fs } from "fs";
import path from "path";

import { ExtensionContext, window, ProgressLocation } from "vscode";

import { Git } from "../services";
import { copyDirectory } from "../util";

async function copyWebViewerFiles(coderankDir: string, repoDir: string): Promise<void> {
    const webPath = path.join(coderankDir, "out", "web", "src");
    await fs.copyFile(path.join(webPath, "index.html"), path.join(repoDir, "index.html"));
    await copyDirectory(path.join(webPath, "static"), path.join(repoDir, "static"));
}

export async function initializeWebViewer(
    context: ExtensionContext,
    saveCredentials: boolean
): Promise<void> {
    await Git.login_context(context, saveCredentials, async (git) => {
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: `Initializing web viewer in ${git.repo}`,
            },
            async (progress) => {
                const reportProgress = (increment: number, message: string): void => {
                    progress.report({ increment, message });
                };
                try {
                    reportProgress(0, `Cloning ${git.repo}`);
                    await git.cloneRepo();

                    reportProgress(40, "Preparing web viewer files");
                    await copyWebViewerFiles(context.extensionPath, git.repoDir);

                    reportProgress(70, `Pushing to ${git.repoAndBranch}`);
                    await git.pushRepo("initialized web viewer");

                    window.showInformationMessage(
                        `Succesfully initialized web viewer in ${git.repoAndBranch}`
                    );
                } catch (err) {
                    window.showErrorMessage(`Error initializing web viewer: ${err}`);
                } finally {
                    await git.teardown();
                }
            }
        );
    });
}
