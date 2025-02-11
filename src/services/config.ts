import { workspace } from "vscode";

export type Config = {
    saveCredentials: boolean;
    autoStore: boolean;
    debug: boolean;
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        saveCredentials: config.get<boolean>("saveCredentials", false),
        autoStore: config.get<boolean>("autoStore", true),
        debug: config.get<boolean>("debug", false),
    };
}
