import { workspace } from "vscode";

export type Config = {
    refreshRate: number;
    saveCredentials: boolean;
    trackChars: boolean;
    autoStore: boolean;
    loadLocalOnStart: boolean;
    debug: boolean;
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        refreshRate: config.get<number>("refreshRate", 100),
        saveCredentials: config.get<boolean>("saveCredentials", false),
        trackChars: config.get<boolean>("trackCharacters", true),
        autoStore: config.get<boolean>("autoStore", true),
        loadLocalOnStart: config.get<boolean>("loadLocalOnStart", true),
        debug: config.get<boolean>("debug", false),
    };
}
