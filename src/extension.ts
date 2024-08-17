import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	let stats = new Stats(0, 0);
	const provider = new CoderankStatsProvider(stats);
	vscode.window.registerTreeDataProvider("coderank", provider);

	vscode.workspace.onDidChangeTextDocument(() => {
		stats.local_buffer += 1;
		provider.refreshIndividualStatLabel("local_buffer", stats.local_buffer.toString());
	});
}

class Stats {
	local_buffer: number;
	total: number;
	constructor(local_buffer: number, total: number) {
		this.local_buffer = local_buffer;
		this.total = total;
	}
}

class StatItem extends vscode.TreeItem {
	constructor(
		id: string,
		label: string,
		iconPath?: vscode.ThemeIcon,
		tooltip?: string,
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.id = id;
		iconPath ? this.iconPath = iconPath : 0;
		tooltip ? this.tooltip = tooltip : 0;
	}
};

class CoderankStatsProvider implements vscode.TreeDataProvider<StatItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<StatItem | null | undefined> = new vscode.EventEmitter<StatItem | null | undefined>();
    readonly onDidChangeTreeData: vscode.Event<StatItem | null | undefined> = this._onDidChangeTreeData.event;

	data: StatItem[];

	constructor(stats: Stats) {
		this.data = [
			new StatItem(
				"local_buffer",
				stats.local_buffer.toString(),
				new vscode.ThemeIcon("keyboard"),
				"Local buffer",
			),
			new StatItem(
				"total",
				stats.total.toString(),
				new vscode.ThemeIcon("circle-outline"),
				"Total stored on GitHub",
			),
		];
	}

	getTreeItem(element: StatItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: StatItem): Thenable<StatItem[]> {
		if (!element) {
			return Promise.resolve(this.data);
		}
		return Promise.resolve([]);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(null);
	}

	refreshIndividualStatLabel(id: string, newValue: string): void {
		const statToUpdate = this.data.find((stat) => stat.id === id);
		if (statToUpdate) {
			statToUpdate.label = newValue;
		}
		this._onDidChangeTreeData.fire(statToUpdate);
	}
}

export function deactivate() {}
