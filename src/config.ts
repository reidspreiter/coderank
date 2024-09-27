import { workspace } from "vscode";

export type Mode = "project" | "local" | "remote";
export type Location = Mode;

export type Config = {
    refreshRate: number;
    charRefreshRate: number;
    trackChars: boolean;
    autoStore: boolean;
    loadLocalOnStart: boolean;
    mode: Mode;
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        refreshRate: config.get<number>("refreshRate", 100),
        charRefreshRate: config.get<number>("charRefreshRate", 100),
        trackChars: config.get<boolean>("trackCharacters", true),
        autoStore: config.get<boolean>("autoStore", true),
        loadLocalOnStart: config.get<boolean>("loadLocalOnStart", true),
        mode: config.get<Mode>("mode", "remote"),
    };
}
