import { workspace, ConfigurationTarget } from "vscode";

import { LogVerbosity } from "./logger";

type PromptToPushFrequency = "daily" | "daily-force" | "weekly" | "weekly-force" | "never";

export type Config = {
    saveCredentials: boolean;
    pushReminderFrequency: PromptToPushFrequency;
    logVerbosity: LogVerbosity;
};

export const DEFAULT_CONFIG: Config = {
    saveCredentials: false,
    pushReminderFrequency: "weekly",
    logVerbosity: "",
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        saveCredentials: config.get<boolean>("saveCredentials", DEFAULT_CONFIG.saveCredentials),
        pushReminderFrequency: config.get<PromptToPushFrequency>(
            "pushReminderFrequency",
            DEFAULT_CONFIG.pushReminderFrequency
        ),
        logVerbosity: config.get<LogVerbosity>("logVerbosity", DEFAULT_CONFIG.logVerbosity),
    };
}

export async function setConfigValue<T extends keyof Config>(
    key: T,
    value: Config[T]
): Promise<void> {
    const config = workspace.getConfiguration("coderank");
    await config.update(key, value, ConfigurationTarget.Global);
}
