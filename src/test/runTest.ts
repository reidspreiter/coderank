import * as path from "path";

import { runTests } from "@vscode/test-electron";

import { initializeWorkspaceContext } from "./workspace";

async function main() {
    await initializeWorkspaceContext(async (workspacePath) => {
        try {
            // The folder containing the Extension Manifest package.json
            // Passed to `--extensionDevelopmentPath`
            const extensionDevelopmentPath = path.resolve(__dirname, "../../");

            // The path to test runner
            // Passed to --extensionTestsPath
            const extensionTestsPath = path.resolve(__dirname, "./suite/index");

            // Download VS Code, unzip it, open the test workspace, and run the tests
            await runTests({
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs: [workspacePath],
            });
        } catch (err) {
            console.error(`Failed to run tests: ${err}`);
            process.exit(1);
        }
    });
}

void main();
