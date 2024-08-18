import * as vscode from 'vscode';

const RANK_SIZE = 100000;

export function activate(context: vscode.ExtensionContext) {

	let stats = getStats();
	const charMap = getCharMap();
	let config = getConfig();
	const provider = new CoderankStatsProvider(config, stats);
	vscode.window.registerTreeDataProvider("coderank", provider);

	vscode.workspace.onDidChangeConfiguration((event) => {
		if (event.affectsConfiguration("coderank")) {
			config = getConfig();
			provider.setStatData(config, stats);
			provider.refresh();
		}
	});

	// Use counter instead of modulo to avoid clamping the buffer to be divisible by the refresh rate.
	// If the user manually refreshes, refresh x characters from that point.
	let countSinceLastRefresh = 0;
	let countSinceLastCharacterRefresh = 0;
	let countSinceLastRank = 0;
	vscode.workspace.onDidChangeTextDocument((event) => {
		// Do not track non-code events like saving the document
		if (!event.contentChanges) {
			return;
		}

		let additions = 0;
		let deletions = 0;
		for (const change of event.contentChanges) {
			const {text, rangeLength} = change;

			// if rangeLength is not 0, a mass content deletion the size of rangeLength occured
			if (rangeLength) {
				deletions += rangeLength;
			} else {
				additions += text.length;
				if (config.trackLocalCharacters) {
					charMap.enterCharData(text);
				}
			}
		}

		const sum = additions + deletions;
		stats.local.total += sum;
		stats.local.added += additions;
		stats.local.deleted += deletions;
		countSinceLastRefresh += sum;
		countSinceLastCharacterRefresh += sum;
		countSinceLastRank += 1;

		if (countSinceLastRefresh >= config.refreshRate) {
			countSinceLastRefresh = 0;
			provider.refreshLocalStats({...stats.local});
		}

		if (countSinceLastRank >= RANK_SIZE) {
			countSinceLastRank = 0;
			stats.local.rank += 1;
			provider.refreshLocalStats({...stats.local});
		}

		if (countSinceLastCharacterRefresh >= config.charRefreshRate) {
			countSinceLastCharacterRefresh = 0;
			if (config.trackLocalCharacters) {
				stats.local.favoriteChar = charMap.calculateFavoriteChar();
				provider.refreshLocalFavoriteCharater(stats.local.favoriteChar);
			}
		}
	});

	vscode.commands.registerCommand("coderank.refreshLocal", () => {
		countSinceLastCharacterRefresh = 0;
		countSinceLastRefresh = 0;
		stats.local.favoriteChar = charMap.calculateFavoriteChar();
		provider.refreshLocalStats({...stats.local}, stats.local.favoriteChar);
	});

	vscode.commands.registerCommand("coderank.rankProgress", () => {
		vscode.window.showInformationMessage(
			`Progress towards next rank: ${countSinceLastRank}/${RANK_SIZE}`
		);
	});

	vscode.commands.registerCommand("coderank.displayLocalCharacterData", () => {
		if (!config.trackLocalCharacters) {
			vscode.window.showErrorMessage(
				"Please enable local character tracking via coderank.trackCharacters\
				in settings.json to access character data"
			);
			return;
		}
		try {
			provider.insertCharacterData(charMap.map);
			vscode.window.showInformationMessage(
				"Your character data is available in the coderank pannel"
			);
		} catch {
			vscode.window.showWarningMessage(
				"Character data is empty. Please try again after typing some characters."
			);
		}
	});

	vscode.commands.registerCommand("coderank.removeLocalCharacterDataDisplay", () => {
		try {
			provider.removeCharacterData();
			vscode.window.showInformationMessage(
				"Removed character data"
			);
		} catch {
			vscode.window.showWarningMessage(
				"No character data to remove"
			);
		}
	});
}

type Config = {
	refreshRate: number;
	charRefreshRate: number;
	trackLocalCharacters: boolean
	trackRemoteCharacters: boolean;
	saveLocally: boolean;
	saveRemotely: boolean;
};

function getConfig(): Config {
	const config = vscode.workspace.getConfiguration("coderank");
	const refreshRate = config.get<number>("refreshRate", 10);
	const charRefreshRate = config.get<number>("favoriteCharacterRefreshRate", 100);
	const trackCharacters = config.get<string[]>("trackCharacters", ["local", "remote"]);
	const saveLocally = config.get<boolean>("saveLocally", true);
	const saveRemotely = config.get<boolean>("saveRemotely", true);

	return {
		refreshRate,
		charRefreshRate,
		trackLocalCharacters: trackCharacters.includes("local"),
		trackRemoteCharacters: trackCharacters.includes("remote"),
		saveLocally,
		saveRemotely,
	};
}

type StatFields = {
	total: number,
	added: number,
	deleted: number,
	favoriteChar: string,
	rank: number,
};

type Stats = {
	local: StatFields,
	remote: StatFields,
};

function getStats(localTotal: number = 0, remoteTotal: number = 0): Stats {
	return {
		local: {
			total: localTotal,
			added: 0,
			deleted: 0,
			favoriteChar: "",
			rank: 0,
		},
		remote: {
			total: remoteTotal,
			added: 0,
			deleted: 0,
			favoriteChar: "",
			rank: 0,
		}
	};
}

interface CharacterHashMap {
	[key: string]: number;
}

class CharData {
	map: CharacterHashMap;
	constructor() {
		this.map = {};
	}

	enterCharData(text: string): void {
		for (const char of text) {
			if (char === "\r") {
				continue;
			}
			if (char in this.map) {
				this.map[char] += 1;
			} else {
				this.map[char] = 1;
			}
		}
	}

	calculateFavoriteChar(): string {
		let maxKey = "";
		let maxValue = 0;
		for (const [key, value] of Object.entries(this.map)) {
			if (value > maxValue) {
				maxValue = value;
				maxKey = key;
			}
		}
		return maxKey;
	}
}

function getCharMap(): CharData {
	return new CharData();
}

type StatItemInitializationOptions = {
	id: string;
    label: string;
    expanded?: boolean;
    iconPath?: vscode.ThemeIcon;
    tooltip?: string;
    children?: StatItem[];
    description?: string;
	contextValue?: string;
};

class StatItem extends vscode.TreeItem {
	children: StatItem[] | undefined;
	constructor(
		{children, expanded = true, label, id, iconPath, tooltip, description, contextValue}
		: StatItemInitializationOptions
	) {
		const collapsibleState = children === undefined
		? vscode.TreeItemCollapsibleState.None
		: expanded
		? vscode.TreeItemCollapsibleState.Expanded
		: vscode.TreeItemCollapsibleState.Collapsed;

		super(label, collapsibleState);
		this.contextValue = contextValue;
		this.id = id;
		this.iconPath = iconPath;
		this.tooltip = tooltip;
		this.children = children;
		this.description = description;
	}
};

class CoderankStatsProvider implements vscode.TreeDataProvider<StatItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<StatItem | null | undefined>
		= new vscode.EventEmitter<StatItem | null | undefined>();
    readonly onDidChangeTreeData: vscode.Event<StatItem | null | undefined>
		= this._onDidChangeTreeData.event;

	private data: StatItem[] = [];

	constructor(config: Config, stats: Stats) {
		this.setStatData(config, stats);
	}

	private buildStatDataChildren(
		location: "local" | "remote",
		trackCharacters: boolean,
		{added, deleted, favoriteChar, rank}: StatFields
	): StatItem[] {
		const children = [
			new StatItem({
				id: `${location}Rank`,
				label: rank.toString(),
				iconPath: new vscode.ThemeIcon("mortar-board"),
				tooltip: `${location} rank\n1 rank = 10,000 additions/deletions`
			}),
			new StatItem({
				id: `${location}Additions`,
				label: added.toString(),
				iconPath: new vscode.ThemeIcon("record-small"),
				tooltip: `${location} additions`
			}),
			new StatItem({
				id: `${location}Deletions`,
				label: deleted.toString(),
				iconPath: new vscode.ThemeIcon("error-small"),
				tooltip: `${location} deletions`
			}),
		];
		if (trackCharacters) {
			children.push(
				new StatItem({
					id: `${location}FavoriteCharacter`,
					label: favoriteChar,
					iconPath: new vscode.ThemeIcon("heart"),
					tooltip: `${location} favorite character`
				})
			);
		}
		return children;
	}

	setStatData(config: Config, stats: Stats): void {
		const localChildren = this.buildStatDataChildren(
			"local",
			config.trackLocalCharacters,
			{...stats.local}
		);
		this.data = [
			new StatItem({
				id: "localTotal",
				label: stats.local.total.toString(),
				iconPath: new vscode.ThemeIcon("keyboard"),
				tooltip: "local total",
				children: localChildren,
			})
		];
		if (config.saveRemotely) {
			const remoteChildren = this.buildStatDataChildren(
				"remote",
				config.trackRemoteCharacters,
				{...stats.remote}
			);
			this.data.push(
				new StatItem({
					id: "remoteTotal",
					label: stats.remote.total.toString(),
					iconPath: new vscode.ThemeIcon("cloud"),
					tooltip: "remote total",
					children: remoteChildren,
					expanded: false,
				})
			);
		}
	}

	getTreeItem(element: StatItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: StatItem): Thenable<StatItem[]> {
		if (element) {
			return Promise.resolve(element.children || []);
		}
		return Promise.resolve(this.data);
	}

	refresh(statToUpdate?: StatItem): void {
		this._onDidChangeTreeData.fire(statToUpdate);
	}

	refreshLocalFavoriteCharater(favoriteChar: string): void {
		const localStats = this.data[0];
		if (localStats.children !== undefined) {
			localStats.children[3].label = favoriteChar;
			this.refresh(localStats.children[3]);
		}
	}

	refreshLocalStats({total, added, deleted, rank}: StatFields, favoriteChar?: string): void {
		const localStats = this.data[0];
		localStats.label = total.toString();
		if (localStats.children !== undefined) {
			localStats.children[0].label = rank.toString();
			localStats.children[1].label = added.toString();
			localStats.children[2].label = deleted.toString();
			if (favoriteChar !== undefined) {
				localStats.children[3].label = favoriteChar;
			}
		}
		this.refresh();
	}

	private buildCharacterDataChildren(map: CharacterHashMap): StatItem[] {
		const children = [];
		const entries = Object.entries(map).sort(([key1], [key2]) => key1.localeCompare(key2));
		for (const [key, value] of entries) {
			children.push(
				new StatItem({
					id: key,
					label: key,
					description: value.toString(),
				})
			);
		}
		return children;
	}

	insertCharacterData(map: CharacterHashMap): void {
		if (Object.entries(map).length === 0) {
			throw new Error("Empty character data");
		}
		if (this.data.length === 3) {
			this.data.pop();
		}
		const children = this.buildCharacterDataChildren(map);
		this.data.push(
			new StatItem({
				id: "characterData",
				label: "character data",
				iconPath: new vscode.ThemeIcon("output"),
				tooltip: "A list of the amount of times each character has been pressed.\
				\nThis list does not update automatically.",
				children,
				expanded: false,
				contextValue: "characterData",
			})
		);
		this.refresh();
	}

	removeCharacterData(): void {
		if (this.data.length === 3) {
			this.data.pop();
			this.refresh();
		} else {
			throw new Error("No active character data");
		}
	}
}

export function deactivate() {}
