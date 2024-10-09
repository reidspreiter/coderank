import {
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
    TreeDataProvider,
    EventEmitter,
    Event,
} from "vscode";

import * as s from "./schemata";
import { Config } from "./services/config";
import { StatsManager } from "./stats";
import { Location } from "./util/common";

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

    constructor(config: Config, stats: StatsManager) {
        this.setStats(config, stats);
    }

    private getLocationIndex(location: Location): number {
        return location === Location.Project ? 0 : location === Location.Local ? 1 : 2;
    }

    private buildCharDataChildren(charData: s.CharMap): StatItem {
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
        fields: s.Fields,
        trackCharacters: boolean
    ): StatItem[] {
        const { net, added, deleted, chars } = fields;
        const children = [
            new StatItem({
                label: net.toString(),
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
            children.push(this.buildCharDataChildren(chars));
        }
        return children;
    }

    setStats(config: Config, stats: StatsManager): void {
        const projectChildren = this.buildChildren(Location.Project, stats.project, config.trackChars);
        const localChildren = this.buildChildren(Location.Local, stats.local, config.trackChars);

        this.data = [
            new StatItem({
                label: stats.project.rank.toString(),
                iconPath: new ThemeIcon("keyboard"),
                tooltip: "project rank (1 rank = 10,000 individual user actions)",
                children: projectChildren,
            }),
            new StatItem({
                label: stats.local.rank.toString(),
                iconPath: new ThemeIcon("device-desktop"),
                tooltip: "local rank (1 rank = 10,000 individual user actions)",
                children: localChildren,
                expanded: false,
            }),
            new StatItem({
                label: stats.remote.toString(),
                iconPath: new ThemeIcon("cloud"),
                tooltip: "remote rank (1 rank = 10,000 individual user actions)",
            }),
        ];
        this.refresh();
    }

    setFields(fields: s.Fields, location: Location, refreshCharData: boolean = false): void {
        const { rank, net, added, deleted, chars } = fields;
        const dataFields = this.data[this.getLocationIndex(location)];
        dataFields.label = rank.toString();

        if (dataFields.children !== undefined) {
            dataFields.children[0].label = net.toString();
            dataFields.children[1].label = added.toString();
            dataFields.children[2].label = deleted.toString();

            if (refreshCharData) {
                dataFields.children[3] = this.buildCharDataChildren(chars);
            }
        }
        this.refresh();
    }
}
