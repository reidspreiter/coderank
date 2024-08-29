import { workspace } from "vscode";
import { CharSortOrder } from "./characters";

export type Config = {
	refreshRate: number;
	charRefreshRate: number;
	trackCharacters: boolean;
    characterSortOrder: CharSortOrder;
	storeLocally: boolean;
	storeRemotely: boolean;
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        refreshRate: config.get<number>("refreshRate", 10),
        charRefreshRate: config.get<number>("characterDataRefreshRate", 1000),
        trackCharacters: config.get<boolean>("trackCharacters", true),
        characterSortOrder: config.get<CharSortOrder>("characterSortOrder", "valDesc"),
        storeLocally: config.get<boolean>("storeLocally", true),
        storeRemotely: config.get<boolean>("storeRemotely", true),
    };
}
