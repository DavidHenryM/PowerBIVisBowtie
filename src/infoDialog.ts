/*
 * "About" modal dialog box (Power BI custom-visual dialog API). Registered on
 * globalThis.dialogRegistry so the host can construct it inside the dialog iframe.
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;
import DialogAction = powerbi.DialogAction;

export interface ArtefactInfoDialogState {
    title: string;
    message: string;
}

export class ArtefactInfoDialog {
    static id = "ArtefactInfoDialog";

    constructor(options: DialogConstructorOptions, initialState: object) {
        const host = options.host;
        const state = initialState as Partial<ArtefactInfoDialogState>;

        const root = document.createElement("div");
        root.style.padding = "16px";
        root.style.fontFamily = "Segoe UI, Arial, sans-serif";
        root.style.fontSize = "13px";
        root.style.color = "#333333";

        const title = document.createElement("h3");
        title.style.marginTop = "0";
        title.textContent = state.title || "About";
        const body = document.createElement("p");
        body.textContent = state.message || "";

        root.appendChild(title);
        root.appendChild(body);
        options.element.appendChild(root);

        document.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.code === "Enter" || e.code === "Escape") {
                host.close(DialogAction.Close, {});
            }
        });
    }
}

declare global {
    var dialogRegistry: Record<string, unknown> | undefined;
}

globalThis.dialogRegistry = globalThis.dialogRegistry || {};
globalThis.dialogRegistry[ArtefactInfoDialog.id] = ArtefactInfoDialog;
