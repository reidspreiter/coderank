import {
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
    TreeDataProvider,
    EventEmitter,
    Event,
} from "vscode";

import * as s from "./shemas";
import { StatsManager } from "./stats";

export enum Location {
    Local = "local",
    Remote = "remote",
}

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

    constructor(stats: StatsManager) {
        this.setStats(stats);
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

    private buildChildren(location: Location, stats: s.CoderankProviderStats): StatItem[] {
        const children = [
            new StatItem({
                label: stats.added.toString(),
                iconPath: new ThemeIcon("diff-added"),
                tooltip: `${location} character additions`,
            }),
            new StatItem({
                label: stats.deleted.toString(),
                iconPath: new ThemeIcon("diff-removed"),
                tooltip: `${location} character deletions`,
            }),
        ];
        return children;
    }

    setStats(stats: StatsManager): void {
        this.data = [
            stats.flushedToLocal
                ? new StatItem({
                      label: stats.localStats.rank.toString(),
                      iconPath: new ThemeIcon("device-desktop"),
                      tooltip: "local rank (1 rank = 10,000 individual user actions)",
                      children: this.buildChildren(Location.Local, stats.localStats),
                      expanded: false,
                  })
                : new StatItem({
                      label: "...",
                      iconPath: new ThemeIcon("device-desktop"),
                      tooltip: "local data will be visible after the buffer is flushed",
                  }),
            stats.flushedToRemote
                ? new StatItem({
                      label: stats.remoteStats.rank.toString(),
                      iconPath: new ThemeIcon("cloud"),
                      tooltip: "remote rank (1 rank = 10,000 individual user actions)",
                      children: this.buildChildren(Location.Remote, stats.remoteStats),
                      expanded: false,
                  })
                : new StatItem({
                      label: "...",
                      iconPath: new ThemeIcon("cloud"),
                      tooltip:
                          "remote data will be visible after the remote repository is accessed",
                  }),
        ];
        this.refresh();
    }
}
