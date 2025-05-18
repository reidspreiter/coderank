import { workspace, ConfigurationTarget } from "vscode";

type PromptToPushFrequency = "daily" | "daily-force" | "weekly" | "weekly-force" | "never";

export type Config = {
    saveCredentials: boolean;
    autoStore: boolean;
    debug: boolean;
    pushReminderFrequency: PromptToPushFrequency;
};

export const DEFAULT_CONFIG: Config = {
    saveCredentials: false,
    autoStore: true,
    debug: false,
    pushReminderFrequency: "weekly",
};

export function getConfig(): Config {
    const config = workspace.getConfiguration("coderank");
    return {
        saveCredentials: config.get<boolean>("saveCredentials", DEFAULT_CONFIG.saveCredentials),
        autoStore: config.get<boolean>("autoStore", DEFAULT_CONFIG.autoStore),
        debug: config.get<boolean>("debug", DEFAULT_CONFIG.debug),
        pushReminderFrequency: config.get<PromptToPushFrequency>(
            "pushReminderFrequency",
            DEFAULT_CONFIG.pushReminderFrequency
        ),
    };
}

export async function setConfigValue<T extends keyof Config>(
    key: T,
    value: Config[T]
): Promise<void> {
    const config = workspace.getConfiguration("coderank");
    await config.update(key, value, ConfigurationTarget.Global);
}
