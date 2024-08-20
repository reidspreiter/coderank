import * as vscode from 'vscode';

const RANK_SIZE = 25000;

export function activate(context: vscode.ExtensionContext) {

	let stats = getStats();
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
					stats.local.characterData.inputCharacterData(text);
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

		if (countSinceLastCharacterRefresh >= config.charRefreshRate) {
			countSinceLastCharacterRefresh = 0;
			if (config.trackLocalCharacters) {
				provider.refreshCharacterData(stats.local.characterData);
			}
		}

		if (countSinceLastRank >= RANK_SIZE) {
			countSinceLastRank = 0;
			stats.local.rank += 1;
			if (config.trackLocalCharacters) {
				provider.refreshLocalStats({...stats.local}, stats.local.characterData);
			} else {
				provider.refreshLocalStats({...stats.local});
			}
		}
	});

	vscode.commands.registerCommand("coderank.refreshLocal", () => {
		countSinceLastCharacterRefresh = 0;
		countSinceLastRefresh = 0;
		if (config.trackLocalCharacters) {
			provider.refreshLocalStats({...stats.local}, stats.local.characterData);
		} else {
			provider.refreshLocalStats({...stats.local});
		}
	});

	vscode.commands.registerCommand("coderank.rankProgress", () => {
		vscode.window.showInformationMessage(
			`Progress towards next rank: ${countSinceLastRank}/${RANK_SIZE}`
		);
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
	const charRefreshRate = config.get<number>("characterDataRefreshRate", 1000);
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
	rank: number,
	total: number,
	added: number,
	deleted: number,
	characterData: CharData,
};

type Stats = {
	local: StatFields,
	remote: StatFields,
};

function getStats(localTotal: number = 0, remoteTotal: number = 0): Stats {
	return {
		local: {
			total: localTotal,
			rank: 0,
			added: 0,
			deleted: 0,
			characterData: new CharData(),
		},
		remote: {
			total: remoteTotal,
			rank: 0,
			added: 0,
			deleted: 0,
			characterData: new CharData(),
		}
	};
}

interface CharacterHashMap {
	[key: string]: number;
}

type SortOrder = "keyAsc" | "keyDesc" | "valAsc" | "valDesc";

class CharData {
	private map: CharacterHashMap;
	private sortOrder: SortOrder = "valDesc";
	private lengthWhenLastSorted = 0;

	constructor() {
		this.map = {};
	}

	inputCharacterData(text: string): void {
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

	getMap(): CharacterHashMap {
		const length = Object.keys(this.map).length;
		if (length !== this.lengthWhenLastSorted) {
			this.sortMap();
			this.lengthWhenLastSorted = length;
		}
		return this.map;
	}

	sortMap(): void {
		let entries = Object.entries(this.map);
		switch (this.sortOrder) {
			case "keyAsc":
				entries.sort(([key1], [key2]) => key1.localeCompare(key2));
				break;
			case "keyDesc":
				entries.sort(([key1], [key2]) => key2.localeCompare(key1));
				break;
			case "valAsc":
				entries.sort(([, val1], [, val2]) => val1 - val2);
				break;
			case "valDesc":
				entries.sort(([, val1], [, val2]) => val2 - val1);
				break;
		}
		this.map = {};
		for (const [key, val] of entries) {
			this.map[key] = val;
		}
	}

	setSortOrder(order: SortOrder): void {
		this.sortOrder = order;
		this.sortMap();
	}
}

type StatItemInitializationOptions = {
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
		{children, expanded = true, label, iconPath, tooltip, description, contextValue}
		: StatItemInitializationOptions
	) {
		const collapsibleState = children === undefined
		? vscode.TreeItemCollapsibleState.None
		: expanded
		? vscode.TreeItemCollapsibleState.Expanded
		: vscode.TreeItemCollapsibleState.Collapsed;

		super(label, collapsibleState);
		this.contextValue = contextValue;
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

	private buildCharacterDataChildren(characterData: CharacterHashMap): StatItem {
		const children = [];
		const entries = Object.entries(characterData);
		for (const [key, value] of entries) {
			children.push(
				new StatItem({
					label: key,
					description: value.toString(),
				})
			);
		}
		const parent = new StatItem({
			label: "character data",
			iconPath: new vscode.ThemeIcon("output"),
			tooltip: "A list of the amount of times each character has been pressed.\
			\nThis list does not update automatically.",
			children,
			expanded: false,
			contextValue: "characterData",
		});
		return parent;
	}

	private buildStatDataChildren(
		location: "local" | "remote",
		{rank, added, deleted, characterData}: StatFields,
		displayCharacters?: boolean,
	): StatItem[] {
		const children = [
			new StatItem({
				label: rank.toString(),
				iconPath: new vscode.ThemeIcon("mortar-board"),
				tooltip: `${location} rank\n1 rank = 10,000 additions/deletions`
			}),
			new StatItem({
				label: added.toString(),
				iconPath: new vscode.ThemeIcon("record-small"),
				tooltip: `${location} additions`
			}),
			new StatItem({
				label: deleted.toString(),
				iconPath: new vscode.ThemeIcon("error-small"),
				tooltip: `${location} deletions`
			}),
		];
		if (displayCharacters === true) {
			this.data.push(this.buildCharacterDataChildren(characterData.getMap()));
		}
		return children;
	}

	setStatData(config: Config, stats: Stats): void {
		const localChildren = this.buildStatDataChildren(
			"local",
			{...stats.local},
			config.trackLocalCharacters,
		);
		this.data = [
			new StatItem({
				label: stats.local.total.toString(),
				iconPath: new vscode.ThemeIcon("keyboard"),
				tooltip: "local total",
				children: localChildren,
			})
		];
		if (config.saveRemotely) {
			const remoteChildren = this.buildStatDataChildren(
				"remote",
				{...stats.remote},
			);
			this.data.push(
				new StatItem({
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

	refresh(): void {
		this._onDidChangeTreeData.fire(null);
	}

	refreshLocalStats({total, added, deleted, rank}: StatFields, characterData?: CharData): void {
		const localStats = this.data[0];
		localStats.label = total.toString();
		if (localStats.children !== undefined) {
			localStats.children[0].label = rank.toString();
			localStats.children[1].label = added.toString();
			localStats.children[2].label = deleted.toString();
			if (characterData !== undefined) {
				localStats.children[3] = this.buildCharacterDataChildren(characterData.getMap());
			}
		}
		this.refresh();
	}

	refreshCharacterData(characterData: CharData): void {
		if (this.data[0].children?.length === 4) {
			this.data[0].children[3] = this.buildCharacterDataChildren(characterData.getMap());
		}
		this.refresh();
	}
}

export function deactivate() {}
