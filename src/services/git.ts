import { promises as fs } from "fs";
import path from "path";

import simpleGit from "simple-git";
import { window, ExtensionContext } from "vscode";

import { getDate } from "../util";

export type GitLoginOptions = {
    saveCredentials: boolean;
    forceLoginPrompts: boolean;
};

const defaultOptions: GitLoginOptions = {
    saveCredentials: false,
    forceLoginPrompts: false,
};

type GitCredentials = {
    username: string;
    token: string;
    repo: string;
};

async function getGitCredentials(
    context: ExtensionContext,
    useSavedCredentials: boolean,
    forceLoginPrompt: boolean
): Promise<GitCredentials | null> {
    const secretsUsername = await context.secrets.get("githubUser");
    const secretsToken = await context.secrets.get("githubPAT");
    const secretsRepo = await context.secrets.get("githubRepo");

    if (
        useSavedCredentials &&
        !forceLoginPrompt &&
        secretsUsername &&
        secretsToken &&
        secretsRepo
    ) {
        return { username: secretsUsername, token: secretsToken, repo: secretsRepo };
    }

    const username = await window.showInputBox({
        prompt: `Enter your GitHub username.${useSavedCredentials ? " If desired, enable credential saving via `coderank.saveCredentials` for faster access." : ""}`,
        placeHolder: "Username",
        value: secretsUsername ?? "",
        ignoreFocusOut: true,
    });

    const token = await window.showInputBox({
        prompt: "Enter your GitHub PAT",
        placeHolder: "Personal access token",
        password: true,
        value: secretsToken ?? "",
        ignoreFocusOut: true,
    });

    const repo = await window.showInputBox({
        prompt: "Enter your coderank repo name",
        placeHolder: "Repository name",
        value: secretsRepo ?? "",
        ignoreFocusOut: true,
    });

    if (username && token && repo) {
        return { username, token, repo };
    }
    return null;
}

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
        options: Partial<GitLoginOptions> = {}
    ): Promise<Git | null> {
        const opts: GitLoginOptions = { ...defaultOptions, ...options };

        const credentials = await getGitCredentials(
            context,
            opts.saveCredentials,
            opts.forceLoginPrompts
        );

        if (credentials !== null) {
            const { username, token, repo } = credentials;
            const branch = null;
            const coderankDir = context.globalStorageUri.fsPath;
            const repoDir = path.join(coderankDir, repo);
            return new Git(username, token, repo, branch, repoDir, coderankDir);
        }
        return null;
    }

    /**
     * Login, clone the repository, await callback, push repository, and teardown
     * @param context
     * @param callback
     * @param options
     */
    static async loginCloneContext(
        context: ExtensionContext,
        callback: (repoDir: string) => void | Promise<void>,
        options: Partial<GitLoginOptions> = {}
    ): Promise<void> {
        const opts: GitLoginOptions = { ...defaultOptions, ...options };

        let git = await Git.login(context, options);
        if (git !== null) {
            while (true) {
                try {
                    git.cloneRepo();
                    break;
                } catch (err) {
                    const errStr = err instanceof Error ? `: ${err.message}` : "";
                    const result = await window.showInformationMessage(
                        `Error cloning coderank git repository${errStr} \n\nWould you like to try again?`,
                        { modal: false },
                        "Yes",
                        "No"
                    );
                    if (result !== "Yes") {
                        return;
                    }

                    git = await Git.login(context, { ...opts, forceLoginPrompts: true });
                    if (git === null) {
                        return;
                    }
                }
            }

            const callbackResult = callback(git.repoDir);
            if (callbackResult instanceof Promise) {
                await callbackResult;
            }

            git.pushRepo();
            await git.teardown();
            if (opts.saveCredentials) {
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
