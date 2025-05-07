import * as path from "path";

import * as v from "vscode";

import { AvailableFiles, WORKSPACE } from "./workspace";

export function getTestContext(): v.ExtensionContext {
    return {
        secrets: {
            _storage: {} as Record<string, string>,
            store: function (key: string, value: string): Thenable<void> {
                this._storage[key] = value;
                return Promise.resolve();
            },
            get: function (key: string): Thenable<string | undefined> {
                return Promise.resolve(this._storage[key]);
            },
        },
        globalStorageUri: {
            fsPath: WORKSPACE,
        },
    } as unknown as v.ExtensionContext;
}

export async function openTextDocument(file: AvailableFiles) {
    const documentUri = v.Uri.file(path.join(WORKSPACE, file));
    const document = await v.workspace.openTextDocument(documentUri);
    await v.window.showTextDocument(document);
}
