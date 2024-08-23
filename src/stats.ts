import { ExtensionContext } from "vscode";
import { CharData, CharSortOrder } from "./characters";
import path from "path";
import { write, writeFileSync } from "fs";

export type StatLocation = "project" | "local" | "remote";

export type StatFields = {
	rank: number,
	total: number,
	added: number,
	deleted: number,
	charData: CharData,
    rankBuffer: number,
};

export class Stats {
    project: StatFields;
	local: StatFields;
	remote: StatFields;

    constructor() {
        this.project = {
            rank: 0,
            rankBuffer: 0,
            total: 0,
            added: 0,
            deleted: 0,
            charData: new CharData(),
        };
        this.local = {
            rank: 0,
            rankBuffer: 0,
			total: 0,
			added: 0,
			deleted: 0,
			charData: new CharData(),
		};
        this.remote = {
            rank: 0,
            rankBuffer: 0,
			total: 0,
			added: 0,
			deleted: 0,
            charData: new CharData(),
		};
    }

    sortCharData(sortOrder: CharSortOrder): void {
        this.project.charData.setSortOrder(sortOrder);
        this.local.charData.setSortOrder(sortOrder);
        this.remote.charData.setSortOrder(sortOrder);
    }

    storeLocal(context: ExtensionContext): void {
        const dataFilePath = path.join(context.globalStorageUri.fsPath, 'coderank.json');
        writeFileSync(dataFilePath, JSON.stringify(this.local));
    }

    // loadLocal(context: ExtensionContext): StatFields {
    //     const dataFilePath = path.join(context.globalStorageUri.fsPath, 'coderank.json');

    // }
};