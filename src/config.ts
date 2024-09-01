import { workspace } from "vscode";

export type Config = {
    refreshRate: number;
    charRefreshRate: number;
    trackChars: boolean;
    storeLocally: boolean;
    autoStoreLocallyOnDocumentSave: boolean;
    loadLocalOnStartup: boolean;
    storeRemotely: boolean;
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        refreshRate: config.get<number>("refreshRate", 10),
        charRefreshRate: config.get<number>("characterDataRefreshRate", 1000),
        trackChars: config.get<boolean>("trackCharacters", true),
        storeLocally: config.get<boolean>("storeLocally", true),
        autoStoreLocallyOnDocumentSave: config.get<boolean>("autoStoreLocallyOnDocumentSave", true),
        loadLocalOnStartup: config.get<boolean>("loadLocalOnStartup", true),
        storeRemotely: config.get<boolean>("storeRemotely", true),
    };
}
