import { workspace } from "vscode";

export class Config {
	refreshRate: number;
	charRefreshRate: number;
	trackCharacters: boolean;
	storeLocally: boolean;
	storeRemotely: boolean;

    constructor() {
        const config = workspace.getConfiguration("coderank");
        this.refreshRate = config.get<number>("refreshRate", 10);
        this.charRefreshRate = config.get<number>("characterDataRefreshRate", 1000);
        this.trackCharacters = config.get<boolean>("trackCharacters", true);
        this.storeLocally = config.get<boolean>("storeLocally", true);
        this.storeRemotely = config.get<boolean>("storeRemotely", true);
    }
};
