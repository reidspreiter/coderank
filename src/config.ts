import { workspace } from "vscode";

export type Mode = "project" | "local" | "remote";
export type Location = Mode;

export type Config = {
    refreshRate: number;
    trackChars: boolean;
    autoStore: boolean;
    loadLocalOnStart: boolean;
    mode: Mode;
    debug: boolean;
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        refreshRate: config.get<number>("refreshRate", 100),
        trackChars: config.get<boolean>("trackCharacters", true),
        autoStore: config.get<boolean>("autoStore", true),
        loadLocalOnStart: config.get<boolean>("loadLocalOnStart", true),
        mode: config.get<Mode>("mode", "remote"),
        debug: config.get<boolean>("debug", false),
    };
}
