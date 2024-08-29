import { ExtensionContext, window } from "vscode";
import { CharData, CharSortOrder } from "./characters";
import path from "path";
import { promises as fs } from "fs";

export type FieldLocation = "project" | "local" | "remote";

type FieldOptions = {
    rank?: number,
    total?: number,
    added?: number,
    deleted?: number,
    charData?: CharData,
    rankBuffer?: number,
    charSortOrder?: CharSortOrder
};

export class Fields {
	rank: number;
	total: number;
	added: number;
	deleted: number;
	charData: CharData;
    rankBuffer: number;

    constructor(
        {rank, total, added, deleted, charData, rankBuffer, charSortOrder}
        : FieldOptions = {}
    ) {
        this.rank = rank ?? 0;
        this.total = total ?? 0;
        this.added = added ?? 0;
        this.deleted = deleted ?? 0;
        this.charData = charData ?? new CharData({sortOrder: charSortOrder});
        this.rankBuffer = rankBuffer ?? 0;
    }

    static fromJSON(json: any): Fields {
        const {rank, total, added, deleted, charData, rankBuffer} = json;
        return new Fields({
            rank,
            total,
            added,
            deleted,
            charData: CharData.fromJSON(charData),
            rankBuffer,
        });
    }

    add(fields: Fields): Fields {
        const {rank, added, deleted, charData, rankBuffer} = fields;
        this.rank += rank;
        this.added += added;
        this.deleted += deleted;
        this.total = this.added - this.deleted;
        this.charData.append(charData.map);
        this.rankBuffer += rankBuffer;
        return this;
    }
};

export class Stats {
    private dataFileName: string;
    project: Fields;
	local: Fields;
	remote: Fields;

    constructor(charSortOrder?: CharSortOrder) {
        this.project = new Fields({charSortOrder});
        this.local = new Fields({charSortOrder});
        this.remote = new Fields({charSortOrder});
        this.dataFileName = "coderank.json";
    }

    sortCharData(sortOrder: CharSortOrder): void {
        this.project.charData.sortMap(sortOrder);
        this.local.charData.sortMap(sortOrder);
        this.remote.charData.sortMap(sortOrder);
    }

    async storeProjectInLocal(context: ExtensionContext): Promise<void> {
        const dataFilePath = path.join(context.globalStorageUri.fsPath, this.dataFileName);
        const dataDirectory = path.dirname(dataFilePath);

        try {
            await fs.mkdir(dataDirectory, {recursive: true});
        } catch (err) {
            window.showErrorMessage(`Encountered error making local data directory: ${dataDirectory}: ${err}`);
            return;
        }

        const projectStats = this.project;
        this.project = new Fields({charSortOrder: projectStats.charData.sortOrder});

        try {
            const data = await fs.readFile(dataFilePath, "utf-8");
            this.local = Fields.fromJSON(JSON.parse(data)).add(projectStats);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                window.showErrorMessage(`Encountered error loading local data from ${dataFilePath}: ${err}`);
                //TODO: ask user if they would like to abort saving locally to not remove the file, or if they'd like to overrite it
            }
        }

        try {
            await fs.writeFile(dataFilePath, JSON.stringify(this.local));
        } catch (err) {
            window.showErrorMessage(`Encountered error writing local data to ${dataFilePath}: ${err}`);
            this.project = this.local;
            return;
        }
        window.showInformationMessage(`Successfully added project data to local storage`);
    }

    async loadLocal(context: ExtensionContext): Promise<void> {
        const dataFilePath = path.join(context.globalStorageUri.fsPath, this.dataFileName);

        try {
            const data = await fs.readFile(dataFilePath, "utf-8");
            this.local = Fields.fromJSON(JSON.parse(data));
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                window.showErrorMessage(`Encountered error loading local data from ${dataFilePath}: ${err}.`);
            } else {
                window.showWarningMessage("Could not find local coderank file, try storing to local first");
            }
        }
        window.showInformationMessage(`Successfully loaded local data from local storage`);
    }
};