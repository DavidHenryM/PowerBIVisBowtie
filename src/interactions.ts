/*
 * Power BI interactivity for the Cytoscape graph:
 *  - hover neighbourhood dimming (nodes and links)
 *  - click selection / cross-filtering via SelectionManager
 *  - right-click context menu
 *  - tooltips via the host tooltip service
 *  - keyboard navigation (Tab into the graph, arrow keys to move focus, Enter/Space to select)
 *  - cross-highlight dimming driven by the report's highlight state
 *  - legend chip panel for in-visual filtering by artefact type / program
 */

"use strict";

import cytoscape from "cytoscape";
import powerbi from "powerbi-visuals-api";
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import ISelectionId = powerbi.visuals.ISelectionId;

import { describeProbability, describeSeverity } from "./bowtie";
import { ProbabilityLevel, SeverityCategory } from "./model";
import { normaliseControlHierarchy } from "./icons";

export type SelectionIdLookup = (nodeId: string) => ISelectionId | undefined;
/** Resolves a localization key to display text, falling back to the given default. */
export type Translate = (key: string, fallback: string) => string;

export class GraphInteractions {
    /** false when the host has disabled interactivity (e.g. read-only/pinned focus mode) */
    private allowInteractions = true;
    private tooltipsEnabled = true;
    /** ordered node ids used for Tab/arrow-key keyboard navigation */
    private focusOrder: string[] = [];
    private focusedIndex = -1;
    private lastTapNodeId: string | undefined;
    private lastTapTime = 0;

    constructor(
        private cy: cytoscape.Core,
        private selectionManager: ISelectionManager,
        private tooltipService: ITooltipService | undefined,
        private getSelectionId: SelectionIdLookup,
        private translate: Translate = (_key, fallback) => fallback,
        private onDrillDown?: (nodeId: string) => void,
        private onOpenLink?: (url: string) => void
    ) { }

    /** Wires all Cytoscape event handlers. Call once after cy creation. */
    public attach(): void {
        this.attachHoverDimming();
        this.attachSelection();
        this.attachContextMenu();
        this.attachTooltips();
        this.attachKeyboardNavigation();
    }

    /** Toggles whether click/keyboard selection and the context menu are active (host-controlled). */
    public setAllowInteractions(allow: boolean): void {
        this.allowInteractions = allow;
    }

    /** Toggles the visual tooltip option without rebuilding the event handlers. */
    public setTooltipsEnabled(enabled: boolean): void {
        this.tooltipsEnabled = enabled;
        if (!enabled && this.tooltipService) {
            this.tooltipService.hide({ immediately: true, isTouchEvent: false });
        }
    }

    /** Sets the node id order used for Tab/arrow-key keyboard navigation. */
    public setFocusOrder(ids: string[]): void {
        this.focusOrder = ids;
        if (this.focusedIndex >= ids.length) {
            this.focusedIndex = -1;
        }
    }

    /** Applies/clears cross-highlight dimming based on data("highlighted") on each element. */
    public applyHighlight(hasActiveHighlight: boolean): void {
        this.cy.batch(() => {
            this.cy.elements().forEach(ele => {
                ele.toggleClass("unhighlighted", hasActiveHighlight && ele.data("highlighted") === false);
            });
        });
    }

    /** Re-applies the host's current selection state to the graph elements. */
    public applySelectionFromManager(): void {
        const ids = (this.selectionManager.getSelectionIds() || []) as ISelectionId[];
        this.cy.batch(() => {
            this.cy.nodes().forEach(n => {
                const sid = this.getSelectionId(n.id());
                const isSelected = !!sid && ids.some(i => i.equals(sid));
                if (isSelected) {
                    n.select();
                } else {
                    n.unselect();
                }
            });
        });
    }

    private attachHoverDimming(): void {
        const cy = this.cy;
        cy.on("mouseover", "node", (e) => {
            const node = e.target as cytoscape.NodeSingular;
            if (node.hasClass("column-header")) {
                return;
            }
            if (node.data("selectable") === false) {
                return;
            }
            const keep = node.closedNeighborhood();
            cy.elements().not(".column-header").difference(keep).addClass("dimmed");
        });
        cy.on("mouseout", "node", () => {
            cy.elements().removeClass("dimmed");
        });
        cy.on("mouseover", "edge", (e) => {
            const edge = e.target as cytoscape.EdgeSingular;
            const keep = edge.connectedNodes().union(edge);
            cy.elements().not(".column-header").difference(keep).addClass("dimmed");
        });
        cy.on("mouseout", "edge", () => {
            cy.elements().removeClass("dimmed");
        });
    }

    private attachSelection(): void {
        this.cy.on("tap", "node", (e) => {
            if (!this.allowInteractions) {
                return;
            }
            const node = e.target as cytoscape.NodeSingular;
            if (node.hasClass("column-header")) {
                return;
            }

            // manual double-tap detection (cytoscape has no built-in "dbltap" for drill gestures)
            const now = Date.now();
            if (this.onDrillDown && this.lastTapNodeId === node.id() && now - this.lastTapTime < 400) {
                this.lastTapNodeId = undefined;
                this.onDrillDown(node.id());
                return;
            }
            this.lastTapNodeId = node.id();
            this.lastTapTime = now;

            const oe = e.originalEvent as MouseEvent | undefined;
            const multi = !!oe && (oe.ctrlKey || oe.metaKey);

            // Hyperlink: Ctrl/Cmd+Click a node with a bound Source/Target URL opens it instead of multi-selecting
            const url = String(node.data("url") || "");
            if (multi && url && this.onOpenLink) {
                this.onOpenLink(url);
                return;
            }

            const sid = this.getSelectionId(node.id());
            if (!sid) {
                return;
            }
            void this.selectionManager.select(sid, multi).then(() => this.applySelectionFromManager());
        });
        // tap on empty canvas clears the selection
        this.cy.on("tap", (e) => {
            if (!this.allowInteractions) {
                return;
            }
            if (e.target === this.cy) {
                void this.selectionManager.clear().then(() => this.applySelectionFromManager());
            }
        });
    }

    private attachContextMenu(): void {
        this.cy.on("cxttap", "node", (e) => {
            if (!this.allowInteractions) {
                return;
            }
            const node = e.target as cytoscape.NodeSingular;
            if (node.hasClass("column-header")) {
                return;
            }
            const sid = this.getSelectionId(node.id());
            if (!sid) {
                return;
            }
            const oe = e.originalEvent as MouseEvent | undefined;
            const point = oe ? { x: oe.clientX, y: oe.clientY } : { x: 0, y: 0 };
            void this.selectionManager.showContextMenu(sid, point);
            if (oe && oe.preventDefault) {
                oe.preventDefault();
            }
        });
    }

    private coordinatesFor(e: cytoscape.EventObject): [number, number] {
        const oe = e.originalEvent as MouseEvent | undefined;
        if (oe && typeof oe.clientX === "number") {
            return [oe.clientX, oe.clientY];
        }
        const rp = e.renderedPosition || { x: 0, y: 0 };
        const rect = (this.cy.container() as HTMLElement).getBoundingClientRect();
        return [rect.left + rp.x, rect.top + rp.y];
    }

    private attachTooltips(): void {
        const ts = this.tooltipService;
        if (!ts) {
            return;
        }

        this.cy.on("mouseover", "node", (e) => {
            if (!this.tooltipsEnabled || !ts.enabled()) return;
            const node = e.target as cytoscape.NodeSingular;
            if (node.hasClass("column-header")) {
                return;
            }
            const d = node.data();
            const dataItems: Array<{ displayName: string; value: string }> = [];
            const addItem = (displayName: string, value: unknown): void => {
                const text = String(value ?? "").trim();
                if (text && text !== "—") dataItems.push({ displayName, value: text });
            };
            addItem(this.translate("Tooltip_Artefact", "Element ID"), d.semanticId || d.id);
            addItem(this.translate("Tooltip_Name", "Name"), d.label || d.semanticId || d.id);
            addItem(this.translate("Tooltip_Type", "Type"), d.type);
            if (d.bowtieRole) {
                addItem(this.translate("Tooltip_BowtieRole", "Bowtie role"), d.bowtieRole);
            }
            if (d.hierarchy) {
                const hierarchy = normaliseControlHierarchy(String(d.hierarchy));
                addItem(this.translate("Tooltip_ControlHierarchy", "Hierarchy of controls"), hierarchy ? hierarchy.label : d.hierarchy);
            }
            if (d.verificationMethodText) {
                addItem(this.translate("Tooltip_VerificationMethod", "Verification method"), d.verificationMethodText);
            }
            if (d.verificationPhaseText) {
                addItem(this.translate("Tooltip_VerificationPhase", "Verification phase"), d.verificationPhaseText);
            }
            if (d.tooltip) {
                addItem(this.translate("Tooltip_Details", "Details"), d.tooltip);
            }
            if (d.severity || d.severityCategory) {
                addItem(this.translate("Tooltip_Severity", "Severity (882E Table I)"), d.severityCategory ? describeSeverity(d.severityCategory as SeverityCategory) : d.severity);
            }
            if (d.probability || d.probabilityLevel) {
                addItem(this.translate("Tooltip_Probability", "Probability (882E Table II)"), d.probabilityLevel ? describeProbability(d.probabilityLevel as ProbabilityLevel) : d.probability);
            }
            if (d.riskLevel) {
                addItem(this.translate("Tooltip_Risk", "Assessed risk (882E Table III)"), d.riskLevel);
            }
            const sid = this.getSelectionId(String(d.id));
            ts.show({
                coordinates: this.coordinatesFor(e),
                isTouchEvent: false,
                dataItems: dataItems,
                identities: sid ? [sid] : []
            });
        });
        this.cy.on("mousemove", "node", (e) => {
            ts.move({ coordinates: this.coordinatesFor(e), isTouchEvent: false, dataItems: [], identities: [] });
        });
        this.cy.on("mouseout", "node", () => ts.hide({ immediately: true, isTouchEvent: false }));

        this.cy.on("mouseover", "edge", (e) => {
            if (!this.tooltipsEnabled || !ts.enabled()) return;
            const d = (e.target as cytoscape.EdgeSingular).data();
            const dataItems = [
                { displayName: this.translate("Tooltip_Relationship", "Relationship"), value: String(d.linkType || "").trim() },
                { displayName: this.translate("Tooltip_From", "From"), value: String(d.source || "").trim() },
                { displayName: this.translate("Tooltip_To", "To"), value: String(d.target || "").trim() }
            ].filter(item => item.value.length > 0);
            ts.show({
                coordinates: this.coordinatesFor(e),
                isTouchEvent: false,
                dataItems: dataItems,
                identities: []
            });
        });
        this.cy.on("mouseout", "edge", () => ts.hide({ immediately: true, isTouchEvent: false }));
    }

    /**
     * Keyboard support (WCAG 2.1 / supportsKeyboardFocus): once the graph container has
     * focus, Left/Right/Up/Down move a focus ring between nodes in data order, Enter/Space
     * selects (cross-filtering the report), and Escape clears the selection and focus ring.
     */
    private attachKeyboardNavigation(): void {
        const container = this.cy.container() as HTMLElement;
        if (!container) {
            return;
        }
        container.addEventListener("keydown", (e: KeyboardEvent) => {
            if (this.focusOrder.length === 0) {
                return;
            }
            switch (e.key) {
                case "ArrowRight":
                case "ArrowDown":
                    e.preventDefault();
                    this.moveFocus(1);
                    break;
                case "ArrowLeft":
                case "ArrowUp":
                    e.preventDefault();
                    this.moveFocus(-1);
                    break;
                case "Enter":
                case " ":
                    if (this.allowInteractions) {
                        e.preventDefault();
                        this.selectFocusedNode(e.ctrlKey || e.metaKey);
                    }
                    break;
                case "Escape":
                    if (this.allowInteractions) {
                        e.preventDefault();
                        void this.selectionManager.clear().then(() => this.applySelectionFromManager());
                    }
                    break;
                default:
                    break;
            }
        });
        container.addEventListener("focus", () => {
            if (this.focusedIndex < 0 && this.focusOrder.length > 0) {
                this.focusedIndex = 0;
                this.highlightFocusedNode();
            }
        });
        container.addEventListener("blur", () => {
            this.cy.nodes().removeClass("kbd-focus");
        });
    }

    private moveFocus(delta: number): void {
        const count = this.focusOrder.length;
        this.focusedIndex = ((this.focusedIndex < 0 ? 0 : this.focusedIndex) + delta + count) % count;
        this.highlightFocusedNode();
    }

    private highlightFocusedNode(): void {
        const id = this.focusOrder[this.focusedIndex];
        if (id === undefined) {
            return;
        }
        this.cy.nodes().removeClass("kbd-focus");
        const node = this.cy.getElementById(id);
        if (node.nonempty()) {
            node.addClass("kbd-focus");
            this.cy.animate({ center: { eles: node }, duration: 150 });
        }
    }

    private selectFocusedNode(multi: boolean): void {
        const id = this.focusOrder[this.focusedIndex];
        const sid = id !== undefined ? this.getSelectionId(id) : undefined;
        if (!sid) {
            return;
        }
        void this.selectionManager.select(sid, multi).then(() => this.applySelectionFromManager());
    }
}

/** A legend chip entry for a bowtie element type (keyed by canonical typeKey). */
export interface LegendTypeEntry {
    key: string;
    label: string;
    colour: string;
}

export interface VerificationLegendEntry {
    key: string;
    label: string;
    colour: string;
    count: number;
}

/**
 * HTML legend overlay with toggleable chips for bowtie element types and programs.
 * Hidden types/programs set display:none on matching nodes (incident edges
 * are hidden automatically by Cytoscape).
 */
export class LegendPanel {
    private hiddenTypeKeys = new Set<string>();
    private hiddenPrograms = new Set<string>();
    private hiddenVerificationMethods = new Set<string>();
    private hiddenVerificationPhases = new Set<string>();

    constructor(
        private container: HTMLElement,
        private getCy: () => cytoscape.Core | undefined,
        private translate: Translate = (_key, fallback) => fallback
    ) { }

    public render(
        typeEntries: LegendTypeEntry[],
        programs: string[],
        typeCounts: Map<string, number>,
        programCounts: Map<string, number>,
        verificationMethods: VerificationLegendEntry[],
        verificationPhases: VerificationLegendEntry[],
        visible: boolean
    ): void {
        // prune hidden entries that no longer exist in the data
        const keys = typeEntries.map(t => t.key);
        this.hiddenTypeKeys.forEach(t => { if (keys.indexOf(t) < 0) { this.hiddenTypeKeys.delete(t); } });
        this.hiddenPrograms.forEach(p => { if (programs.indexOf(p) < 0) { this.hiddenPrograms.delete(p); } });
        const methodKeys = verificationMethods.map(entry => entry.key);
        const phaseKeys = verificationPhases.map(entry => entry.key);
        this.hiddenVerificationMethods.forEach(value => { if (methodKeys.indexOf(value) < 0) this.hiddenVerificationMethods.delete(value); });
        this.hiddenVerificationPhases.forEach(value => { if (phaseKeys.indexOf(value) < 0) this.hiddenVerificationPhases.delete(value); });

        this.container.textContent = "";
        if (!visible || (typeEntries.length === 0 && programs.length === 0 && verificationMethods.length === 0 && verificationPhases.length === 0)) {
            this.container.style.display = "none";
            return;
        }
        this.container.style.display = "block";

        this.container.appendChild(this.makeTitle(this.translate("Legend_FilterTitle", "Filter")));

        if (typeEntries.length > 0) {
            this.container.appendChild(this.makeSectionLabel(this.translate("Legend_BowtieElement", "Bowtie element")));
            for (const t of typeEntries) {
                this.container.appendChild(this.makeChip(t.label, typeCounts.get(t.key) || 0, t.colour, this.hiddenTypeKeys.has(t.key), () => {
                    this.toggle(this.hiddenTypeKeys, t.key);
                    this.applyVisibility();
                    this.render(typeEntries, programs, typeCounts, programCounts, verificationMethods, verificationPhases, visible);
                }));
            }
        }
        if (programs.length > 0) {
            this.container.appendChild(this.makeSectionLabel(this.translate("Legend_Program", "Program")));
            for (const p of programs) {
                this.container.appendChild(this.makeChip(p, programCounts.get(p) || 0, "#607D8B", this.hiddenPrograms.has(p), () => {
                    this.toggle(this.hiddenPrograms, p);
                    this.applyVisibility();
                    this.render(typeEntries, programs, typeCounts, programCounts, verificationMethods, verificationPhases, visible);
                }));
            }
        }
        this.renderVerificationSection(
            this.translate("Legend_VerificationMethod", "Verification method"),
            verificationMethods,
            this.hiddenVerificationMethods,
            () => this.render(typeEntries, programs, typeCounts, programCounts, verificationMethods, verificationPhases, visible));
        this.renderVerificationSection(
            this.translate("Legend_VerificationPhase", "Verification phase"),
            verificationPhases,
            this.hiddenVerificationPhases,
            () => this.render(typeEntries, programs, typeCounts, programCounts, verificationMethods, verificationPhases, visible));
        this.applyVisibility();
    }

    private renderVerificationSection(title: string, entries: VerificationLegendEntry[], hidden: Set<string>, rerender: () => void): void {
        if (entries.length === 0) return;
        this.container.appendChild(this.makeSectionLabel(title));
        for (const entry of entries) {
            this.container.appendChild(this.makeChip(entry.label, entry.count, entry.colour, hidden.has(entry.key), () => {
                this.toggle(hidden, entry.key);
                this.applyVisibility();
                rerender();
            }));
        }
    }

    private toggle(set: Set<string>, value: string): void {
        if (set.has(value)) {
            set.delete(value);
        } else {
            set.add(value);
        }
    }

    private applyVisibility(): void {
        const cy = this.getCy();
        if (!cy) {
            return;
        }
        cy.batch(() => {
            cy.nodes().forEach(n => {
                if (n.hasClass("column-header")) {
                    return;
                }
                const typeKey = String(n.data("typeKey") || "");
                const program = String(n.data("program") || "");
                const methods = (Array.isArray(n.data("verificationMethods")) ? n.data("verificationMethods") : [])
                    .map((value: unknown) => String(value).trim().toLocaleLowerCase());
                const phases = (Array.isArray(n.data("verificationPhases")) ? n.data("verificationPhases") : [])
                    .map((value: unknown) => String(value).trim().toLocaleLowerCase());
                const verificationVisible = !methods.some((value: string) => this.hiddenVerificationMethods.has(value))
                    && !phases.some((value: string) => this.hiddenVerificationPhases.has(value));
                const visible = !this.hiddenTypeKeys.has(typeKey) && !this.hiddenPrograms.has(program) && verificationVisible;
                n.style("display", visible ? "element" : "none");
            });
        });
    }

    private makeTitle(text: string): HTMLElement {
        const el = document.createElement("div");
        el.className = "legend-title";
        el.textContent = text;
        return el;
    }

    private makeSectionLabel(text: string): HTMLElement {
        const el = document.createElement("div");
        el.className = "legend-section";
        el.textContent = text;
        return el;
    }

    private makeChip(label: string, count: number, colour: string, off: boolean, onClick: () => void): HTMLElement {
        const chip = document.createElement("span");
        chip.className = "legend-chip" + (off ? " off" : "");
        chip.tabIndex = 0;
        chip.setAttribute("role", "checkbox");
        chip.setAttribute("aria-checked", String(!off));
        chip.setAttribute("aria-label", label + " (" + count + ")");
        const dot = document.createElement("span");
        dot.className = "legend-dot";
        dot.style.backgroundColor = colour;
        const text = document.createElement("span");
        text.textContent = label + " (" + count + ")";
        chip.appendChild(dot);
        chip.appendChild(text);
        chip.addEventListener("click", onClick);
        chip.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
            }
        });
        return chip;
    }
}
