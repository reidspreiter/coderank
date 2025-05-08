import { promises as fs } from "fs";
import * as path from "path";

import * as v from "vscode";

import * as s from "../schemas";
import { CODERANK_FILENAME } from "../util";

import { Buffer } from ".";

export class LocalStorage {
    private constructor(
        private directory: string,
        private coderankFilePath: string
    ) {}

    static async init(context: v.ExtensionContext): Promise<LocalStorage> {
        const directory = context.globalStorageUri.fsPath;
        const coderankFilePath = path.join(directory, CODERANK_FILENAME);
        await fs.mkdir(directory, { recursive: true });
        return new LocalStorage(directory, coderankFilePath);
    }

    async readCoderankFile(): Promise<s.CoderankFile> {
        let data = await s.readJSONFile(this.coderankFilePath, s.CoderankFileSchema);
        return data || s.CoderankFileSchema.parse({});
    }

    async clear() {
        await fs.rm(this.coderankFilePath);
    }

    async addBuffer(buffer: Buffer): Promise<s.CoderankProviderStats> {
        let localFile = await this.readCoderankFile();
        localFile = s.sumBufferToLocalFile(
            localFile,
            buffer.data,
            buffer.year,
            buffer.machine,
        );
        await fs.writeFile(this.coderankFilePath, s.stringify(localFile), "utf-8");
        return s.CoderankProviderStatsSchema.parse(localFile);
    }
}
