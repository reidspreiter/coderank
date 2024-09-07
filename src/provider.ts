import {
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
    TreeDataProvider,
    EventEmitter,
    Event,
} from "vscode";
import { CharMap } from "./characters";
import { Config, Location } from "./config";
import { Stats, Fields } from "./stats";

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
    constructor({
        children,
        expanded = true,
        label,
        iconPath,
        tooltip,
        description,
        contextValue,
    }: StatItemInitializationOptions) {
        const collapsibleState =
            children === undefined
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
}

export class CoderankStatsProvider implements TreeDataProvider<StatItem> {
    private _onDidChangeTreeData: EventEmitter<StatItem | null | undefined> = new EventEmitter<
        StatItem | null | undefined
    >();
    readonly onDidChangeTreeData: Event<StatItem | null | undefined> =
        this._onDidChangeTreeData.event;

    private data: StatItem[] = [];

    constructor(config: Config, stats: Stats) {
        this.setStats(config, stats);
    }

    private getFieldLocationIndex(location: Location): number {
        return location === "project" ? 0 : location === "local" ? 1 : 2;
    }

    private buildCharDataChildren(charData: CharMap): StatItem {
        let children = undefined;
        const entries = Object.entries(charData);
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
            tooltip: "amount of times characters have been pressed",
            children,
            expanded: false,
            contextValue: "characterData",
        });
        return parent;
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

    private buildChildren(
        location: Location,
        fields: Fields,
        trackCharacters: boolean
    ): StatItem[] {
        const { total, added, deleted, chars } = fields;
        const children = [
            new StatItem({
                label: total.toString(),
                iconPath: new ThemeIcon("diff-modified"),
                tooltip: `${location} additions - deletions`,
            }),
            new StatItem({
                label: added.toString(),
                iconPath: new ThemeIcon("diff-added"),
                tooltip: `${location} character additions`,
            }),
            new StatItem({
                label: deleted.toString(),
                iconPath: new ThemeIcon("diff-removed"),
                tooltip: `${location} character deletions`,
            }),
        ];
        if (trackCharacters) {
            children.push(this.buildCharDataChildren(chars.map));
        }
        return children;
    }

    setStats(config: Config, stats: Stats): void {
        const projectChildren = this.buildChildren("project", stats.project, config.trackChars);
        this.data = [
            new StatItem({
                label: stats.project.rank.toString(),
                iconPath: new ThemeIcon("keyboard"),
                tooltip: "project rank (1 rank = 10,000 individual user actions)",
                children: projectChildren,
            }),
        ];
        if (config.mode !== "project") {
            const localChildren = this.buildChildren("local", stats.local, config.trackChars);
            this.data.push(
                new StatItem({
                    label: stats.local.rank.toString(),
                    iconPath: new ThemeIcon("device-desktop"),
                    tooltip: "local rank (1 rank = 10,000 individual user actions)",
                    children: localChildren,
                    expanded: false,
                })
            );
        }
        if (config.mode === "remote") {
            const remoteChildren = this.buildChildren("remote", stats.remote, config.trackChars);
            this.data.push(
                new StatItem({
                    label: stats.remote.rank.toString(),
                    iconPath: new ThemeIcon("cloud"),
                    tooltip: "remote rank (1 rank = 10,000 individual user actions)",
                    children: remoteChildren,
                    expanded: false,
                })
            );
        }
        this.refresh();
    }

    setFields(
        fields: Fields,
        location: Location,
        options?: "refreshCharDataOnly" | "refreshAll"
    ): void {
        const { rank, total, added, deleted, chars } = fields;
        const dataFields = this.data[this.getFieldLocationIndex(location)];
        dataFields.label = rank.toString();

        if (dataFields.children !== undefined) {
            if (options !== "refreshCharDataOnly") {
                dataFields.children[0].label = total.toString();
                dataFields.children[1].label = added.toString();
                dataFields.children[2].label = deleted.toString();
            }
            if (options === "refreshCharDataOnly" || options === "refreshAll") {
                dataFields.children[3] = this.buildCharDataChildren(chars.map);
            }
        }
        this.refresh();
    }

    setCharData(stats: Stats): void {
        Object.entries(stats).forEach(([key, value]) => {
            const index = this.getFieldLocationIndex(key as Location);
            if (this.data[index].children?.length === 4) {
                this.data[index].children[3] = this.buildCharDataChildren(value.charData.map);
            }
        });
        this.refresh();
    }
}
