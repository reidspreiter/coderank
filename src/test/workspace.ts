import { promises as fs } from "fs";
import * as path from "path";

import { pathExists } from "../util";

export const FILES = ["test.txt", "test.js"] as const;
export type AvailableFiles = (typeof FILES)[number];

export const WORKSPACE = path.join(__dirname, "test-workspace");

export async function initializeWorkspaceContext(
    callback: (workspacePath: string) => Promise<void>
) {
    if (await pathExists(WORKSPACE)) {
        throw new Error("Error initializing workspace context: workspace already exists");
    }
    try {
        await fs.mkdir(WORKSPACE);
        for (const name of FILES) {
            await fs.writeFile(path.join(WORKSPACE, name), "");
        }
        await callback(WORKSPACE);
    } finally {
        await fs.rm(WORKSPACE, { recursive: true, force: true });
    }
}
