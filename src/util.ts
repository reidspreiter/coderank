import { window } from "vscode";

export function getWeek(): number {
    const currentDate = new Date();
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);

    const days = Math.floor(
        (currentDate.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
    );
    const weekNumber = Math.ceil((days + 1) / 7);
    return weekNumber;
}

export function getYear(): number {
    const today = new Date();
    return today.getFullYear();
}

export function dynamicSuccessMessage(message: string, calledAutomatically: boolean): void {
    if (calledAutomatically) {
        window.setStatusBarMessage(message, 8000);
    } else {
        window.showInformationMessage(message);
    }
}
