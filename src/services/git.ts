import { promises as fs } from "fs";
import path from "path";

import simpleGit from "simple-git";
import { window, ExtensionContext } from "vscode";

import { getDate, CODERANK_FILENAME } from "../util";

export class Git {
    private constructor(
        private username: string,
        private token: string,
        public repo: string,
        public branch: string | null,
        public repoDir: string,
        public coderankDir: string
    ) {}

    private static async login(
        context: ExtensionContext,
        saveCredentials: boolean
    ): Promise<Git | null> {
        const username = await window.showInputBox({
            prompt: `Enter your GitHub username.${saveCredentials ? " If desired, enable credential saving via `coderank.saveCredentials` for faster access." : ""}`,
            placeHolder: "Username",
            value: (await context.secrets.get("githubUser")) ?? "",
            ignoreFocusOut: true,
        });

        const token = await window.showInputBox({
            prompt: "Enter your GitHub PAT",
            placeHolder: "Personal access token",
            password: true,
            value: (await context.secrets.get("githubPAT")) ?? "",
            ignoreFocusOut: true,
        });

        const repo = await window.showInputBox({
            prompt: "Enter your coderank repo name",
            placeHolder: "Repository name",
            value: (await context.secrets.get("githubRepo")) ?? "",
            ignoreFocusOut: true,
        });

        // Unknown branch name until repo is cloned
        const branch = null;

        if (username && token && repo) {
            const coderankDir = context.globalStorageUri.fsPath;
            const repoDir = path.join(coderankDir, repo);
            return new Git(username, token, repo, branch, repoDir, coderankDir);
        }
        return null;
    }

    /**
     * Login, clone the repository, await callback, push repository, and teardown
     * @param context
     * @param saveCredentials
     * @param callback
     */
    static async loginCloneContext(
        context: ExtensionContext,
        saveCredentials: boolean,
        callback: (repoDir: string) => void | Promise<void>
    ): Promise<void> {
        const git = await Git.login(context, saveCredentials);
        if (git !== null) {
            git.cloneRepo();

            const callbackResult = callback(git.repoDir);
            if (callbackResult instanceof Promise) {
                await callbackResult;
            }

            git.pushRepo();
            await git.teardown();
            if (saveCredentials) {
                await git.saveCredentials(context);
            }
        }
    }

    async cloneRepo(): Promise<void> {
        await fs.rm(this.repoDir, { recursive: true, force: true });
        const cloneUrl = `https://${this.username}:${this.token}@github.com/${this.username}/${this.repo}.git`;
        const git = simpleGit(this.coderankDir);
        await git.clone(cloneUrl, this.repoDir);
        const status = await git.status();
        this.branch = status.current;
    }

    async pushRepo(message?: string): Promise<void> {
        message = message || getDate();
        const git = simpleGit(this.repoDir);
        await git.add("./*");
        await git.commit(`coderank auto-commit: ${message}`);
        await git.push();
    }

    async saveCredentials(context: ExtensionContext): Promise<void> {
        await context.secrets.store("githubUser", this.username);
        await context.secrets.store("githubPAT", this.token);
        await context.secrets.store("githubRepo", this.repo);
    }

    async teardown(): Promise<void> {
        try {
            this.branch = null;
            await fs.rm(this.repoDir, { recursive: true, force: true });
        } catch (err) {
            window.showWarningMessage(
                `Warning: failed to remove ${this.repoDir}. This is not critical, but may cause issues when ${this.repo} is next cloned: ${err}`
            );
        }
    }

    get repoAndBranch(): string {
        return this.branch ? `${this.repo}/${this.branch}` : this.repo;
    }
}
