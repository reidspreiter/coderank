import { ThemeIcon, TreeItem, TreeItemCollapsibleState, TreeDataProvider, EventEmitter, Event } from "vscode";
import { CharData, CharHashMap } from "./characters";
import { Config } from "./config";
import { Stats, StatFields, StatLocation } from "./stats";

const RANK_SIZE = 10000;

type StatItemInitializationOptions = {
    label: string;
    expanded?: boolean;
    iconPath?: ThemeIcon;
    tooltip?: string;
    children?: StatItem[];
    description?: string;
	contextValue?: string;
};

class StatItem extends TreeItem {
	children: StatItem[] | undefined;
	constructor(
		{children, expanded = true, label, iconPath, tooltip, description, contextValue}
		: StatItemInitializationOptions
	) {
		const collapsibleState = children === undefined
		? TreeItemCollapsibleState.None
		: expanded
		? TreeItemCollapsibleState.Expanded
		: TreeItemCollapsibleState.Collapsed;

		super(label, collapsibleState);
		this.contextValue = contextValue;
		this.iconPath = iconPath;
		this.tooltip = tooltip;
		this.children = children;
		this.description = description;
	}
};

export class CoderankStatsProvider implements TreeDataProvider<StatItem> {

	private _onDidChangeTreeData: EventEmitter<StatItem | null | undefined>
		= new EventEmitter<StatItem | null | undefined>();
	readonly onDidChangeTreeData: Event<StatItem | null | undefined>
		= this._onDidChangeTreeData.event;

	private data: StatItem[] = [];

	constructor(config: Config, stats: Stats) {
		this.setData(config, stats);
	}

	private buildCharacterDataChildren(characterData: CharHashMap): StatItem {
		let children = undefined;
		const entries = Object.entries(characterData);
        if (entries.length !== 0) {
            children = [];
            for (const [key, value] of entries) {
                children.push(
                    new StatItem({
                        label: key,
                        description: value.toString(),
                    })
                );
            }
        }
		const parent = new StatItem({
			label: "chars",
			iconPath: new ThemeIcon("output"),
			tooltip: "A list of the amount of times each character has been pressed.\
			\nThis list does not update automatically.",
			children,
			expanded: false,
			contextValue: "characterData",
		});
		return parent;
	}

	private buildChildren(
		location: StatLocation,
		{total, added, deleted, charData}: StatFields,
        trackCharacters: boolean,
	): StatItem[] {
		const children = [
			new StatItem({
				label: total.toString(),
				iconPath: new ThemeIcon("diff-modified"),
				tooltip: `${location} total`
			}),
			new StatItem({
				label: added.toString(),
				iconPath: new ThemeIcon("diff-added"),
				tooltip: `${location} additions`
			}),
			new StatItem({
				label: deleted.toString(),
				iconPath: new ThemeIcon("diff-removed"),
				tooltip: `${location} deletions`
			}),
		];
        if (trackCharacters) {
            children.push(this.buildCharacterDataChildren(charData.getMap()));
        }
		return children;
	}

	setData(config: Config, stats: Stats): void {
		const projectChildren = this.buildChildren(
			"project",
			{...stats.project},
			config.trackCharacters,
		);
		this.data = [
			new StatItem({
				label: stats.project.rank.toString(),
				iconPath: new ThemeIcon("keyboard"),
				tooltip: "project rank",
				children: projectChildren,
			})
		];
        if (config.storeLocally) {
            const localChildren = this.buildChildren(
                "local",
                {...stats.local},
                config.trackCharacters,
            );
            this.data.push(
                new StatItem({
                    label: stats.local.rank.toString(),
                    iconPath: new ThemeIcon("device-desktop"),
                    tooltip: "local rank",
                    children: localChildren,
                    expanded: false,
                })
            );
        }
		if (config.storeRemotely) {
			const remoteChildren = this.buildChildren(
				"remote",
				{...stats.remote},
                config.trackCharacters,
			);
			this.data.push(
				new StatItem({
					label: stats.remote.rank.toString(),
					iconPath: new ThemeIcon("cloud"),
					tooltip: "remote rank",
					children: remoteChildren,
					expanded: false,
				})
			);
		}
	}

	getTreeItem(element: StatItem): TreeItem {
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

	refreshProjectStats({total, added, deleted, rank}: StatFields, characterData?: CharData): void {
		const localStats = this.data[0];
		localStats.label = rank.toString();
		if (localStats.children !== undefined) {
			localStats.children[0].label = total.toString();
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