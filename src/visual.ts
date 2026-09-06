/*
 * Safety Bowtie visual (MIL-STD-882E).
 *
 * Renders a system safety bowtie as a node-link diagram: causal factors and
 * preventive controls on the left, the hazard (top event) at the centre, and
 * mitigative controls and mishaps on the right. When the severity and
 * probability roles are bound, hazard and mishap nodes are coloured by their
 * assessed mishap risk per 882E Table III.
 */

"use strict";

import cytoscape from "cytoscape";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ITooltipService = powerbi.extensibility.ITooltipService;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import DataView = powerbi.DataView;
import ISelectionId = powerbi.visuals.ISelectionId;

import { VisualFormattingSettingsModel } from "./settings";
import { buildGraph, toCytoscapeElements, GraphModel } from "./model";
import { buildStylesheet, StyleConfig, typeColour } from "./stylesheet";
import { cachePositions, applyCachedPositions, computeBowtiePositions, runBowtieLayout } from "./layouts";
import { deriveBowtieTopology, BowtieTopology } from "./bowtie";
import { GraphInteractions, LegendPanel } from "./interactions";
import { ArtefactInfoDialog } from "./infoDialog";

const SUPPORT_URL = "https://github.com/DavidHenryM/PowerBIVisBowtie";

const EMPTY_GRAPH: GraphModel = { nodes: [], links: [], types: [], programs: [], hasActiveHighlight: false };

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private tooltipService: ITooltipService | undefined;
    private localizationManager: ILocalizationManager | undefined;
    private formattingSettingsService: FormattingSettingsService;
    private formattingSettings: VisualFormattingSettingsModel | undefined;

    private root: HTMLElement;
    private cyContainer: HTMLElement;
    private legendContainer: HTMLElement;
    private emptyMessage: HTMLElement;
    private landingPage: HTMLElement;
    private noteMessage: HTMLElement;
    private toolbar: HTMLElement;

    private cy: cytoscape.Core | undefined;
    private interactions: GraphInteractions | undefined;
    private legend: LegendPanel | undefined;
    private lastStyleConfig: StyleConfig | undefined;

    private identityMap = new Map<string, ISelectionId>();
    private positionCache = new Map<string, { x: number; y: number }>();
    /** spacing signature — cached positions are dropped when the column/lane spacing changes */
    private positionCacheKey = "";
    private hasLayoutCompleted = false;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.tooltipService = options.host.tooltipService;
        this.localizationManager = options.host.createLocalizationManager();
        this.formattingSettingsService = new FormattingSettingsService();

        this.root = document.createElement("div");
        this.root.className = "artefact-relation-root";
        this.cyContainer = document.createElement("div");
        this.cyContainer.className = "cy-container";
        this.cyContainer.tabIndex = 0;
        this.cyContainer.setAttribute("role", "img");
        this.cyContainer.setAttribute("aria-label", this.translate("Visual_LandingTitle", "Safety Bowtie (MIL-STD-882E)"));
        this.emptyMessage = document.createElement("div");
        this.emptyMessage.className = "empty-message";
        this.emptyMessage.textContent = this.translate("Visual_EmptyMessage", "Bind Source ID and Target ID fields to display the safety bowtie.");
        this.landingPage = document.createElement("div");
        this.landingPage.className = "landing-page";
        this.landingPage.style.display = "none";
        const landingTitle = document.createElement("div");
        landingTitle.className = "landing-title";
        landingTitle.textContent = this.translate("Visual_LandingTitle", "Safety Bowtie (MIL-STD-882E)");
        const landingDescription = document.createElement("div");
        landingDescription.className = "landing-description";
        landingDescription.textContent = this.translate("Visual_LandingDescription",
            "Visualise a MIL-STD-882E system safety bowtie: causal factors and preventive controls on the left, the hazard (top event) at the centre, mitigative controls and mishaps on the right. Add Source ID and Target ID fields to get started.");
        this.landingPage.appendChild(landingTitle);
        this.landingPage.appendChild(landingDescription);
        this.legendContainer = document.createElement("div");
        this.legendContainer.className = "legend-panel";
        this.legendContainer.style.display = "none";
        this.noteMessage = document.createElement("div");
        this.noteMessage.className = "topology-note";
        this.noteMessage.style.display = "none";

        this.toolbar = document.createElement("div");
        this.toolbar.className = "visual-toolbar";
        const aboutButton = document.createElement("button");
        aboutButton.type = "button";
        aboutButton.className = "toolbar-button";
        aboutButton.textContent = "i";
        aboutButton.title = this.translate("Toolbar_HelpButton", "About / help");
        aboutButton.setAttribute("aria-label", this.translate("Toolbar_HelpButton", "About / help"));
        aboutButton.addEventListener("click", () => this.openAboutDialog());
        const docsButton = document.createElement("button");
        docsButton.type = "button";
        docsButton.className = "toolbar-button";
        docsButton.textContent = "\u2197";
        docsButton.title = "Documentation";
        docsButton.setAttribute("aria-label", "Open documentation");
        docsButton.addEventListener("click", () => this.host.launchUrl(SUPPORT_URL));
        this.toolbar.appendChild(aboutButton);
        this.toolbar.appendChild(docsButton);

        this.root.appendChild(this.cyContainer);
        this.root.appendChild(this.emptyMessage);
        this.root.appendChild(this.landingPage);
        this.root.appendChild(this.legendContainer);
        this.root.appendChild(this.noteMessage);
        this.root.appendChild(this.toolbar);
        options.element.appendChild(this.root);
    }

    /** Resolves a localization key via the host's localization manager, falling back to the given default. */
    private translate(key: string, fallback: string): string {
        const lm = this.localizationManager;
        if (!lm) {
            return fallback;
        }
        const value = lm.getDisplayName(key);
        return value === key ? fallback : value;
    }

    /** Modal Dialog: shows an "about" panel describing the visual (host.openModalDialog). */
    private openAboutDialog(): void {
        if (this.host.hostCapabilities.allowModalDialog === false) {
            return;
        }
        const dialogOptions: powerbi.extensibility.visual.DialogOpenOptions = {
            title: this.translate("AboutDialog_Title", "About Safety Bowtie (MIL-STD-882E)"),
            size: { width: 340, height: 240 },
            position: { type: powerbi.VisualDialogPositionType.Center },
            actionButtons: [powerbi.DialogAction.Close]
        };
        const initialState = {
            title: this.translate("AboutDialog_Title", "About Safety Bowtie (MIL-STD-882E)"),
            message: this.translate("AboutDialog_Message",
                "Renders a MIL-STD-882E safety bowtie: causal factors flow through preventive controls into the hazard (top event), then out through mitigative controls to mishaps. Bind severity and probability to colour nodes by assessed mishap risk (882E Table III). Click a node to cross-filter, double-click to drill, and use the legend to filter by element type or program.")
        };
        void this.host.openModalDialog(ArtefactInfoDialog.id, dialogOptions, initialState);
    }

    /** Drill Down: requests the next hierarchy level for the artefact-type role of a double-clicked node. */
    private handleDrillDown(nodeId: string): void {
        if (this.host.hostCapabilities.allowInteractions === false) {
            return;
        }
        void nodeId; // drill targets the bound hierarchy field, not a specific data point
        this.host.drill({ roleName: "sourceType", drillType: powerbi.DrillType.Down });
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            const dataView: DataView | undefined = options.dataViews && options.dataViews.length > 0
                ? options.dataViews[0]
                : undefined;
            if (dataView) {
                this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                    VisualFormattingSettingsModel, dataView);
            }
            const settings = this.formattingSettings || new VisualFormattingSettingsModel();

            const graph: GraphModel = dataView ? buildGraph(dataView, this.host) : EMPTY_GRAPH;

            this.identityMap.clear();
            for (const node of graph.nodes) {
                if (node.selectionId) {
                    this.identityMap.set(node.id, node.selectionId);
                }
            }

            if (graph.nodes.length === 0) {
                // no fields bound at all -> landing page; fields bound but no matching rows -> empty message
                this.showEmptyState(!dataView ? "landing" : "empty");
                if (this.cy) {
                    this.cy.elements().remove();
                }
                this.renderLegend(graph, settings, false);
                this.host.setCanDrill(false);
                this.events.renderingFinished(options);
                return;
            }
            this.showEmptyState("none");

            // bowtie topology: pick the top event, assign sides/ranks/lanes, assess 882E risk
            const topology = deriveBowtieTopology(graph);
            this.updateTopologyNote(topology);
            const hidden = new Set(topology.hiddenNodeIds);
            const visibleNodes = graph.nodes.filter(n => !hidden.has(n.id));
            const visibleGraph: GraphModel = {
                nodes: visibleNodes,
                links: graph.links.filter(l => !hidden.has(l.source) && !hidden.has(l.target)),
                types: Array.from(new Set(visibleNodes.map(n => n.type).filter(t => !!t))).sort(),
                programs: Array.from(new Set(visibleNodes.map(n => n.program).filter(p => !!p))).sort(),
                hasActiveHighlight: graph.hasActiveHighlight
            };

            const styleConfig = this.buildStyleConfig(settings);
            this.lastStyleConfig = styleConfig;
            // Color Palette / High Contrast: match the report theme's canvas background
            this.cyContainer.style.backgroundColor = styleConfig.highContrast ? styleConfig.backgroundColor : "";

            if (!this.cy) {
                this.cy = cytoscape({
                    container: this.cyContainer,
                    style: buildStylesheet(styleConfig),
                    elements: [],
                    wheelSensitivity: 0.2,
                    minZoom: 0.05,
                    maxZoom: 5,
                    boxSelectionEnabled: false
                });
                this.interactions = new GraphInteractions(
                    this.cy,
                    this.selectionManager,
                    this.tooltipService,
                    (id) => this.identityMap.get(id),
                    (key, fallback) => this.translate(key, fallback),
                    (nodeId) => this.handleDrillDown(nodeId),
                    (url) => this.host.launchUrl(url));
                this.interactions.attach();
            } else {
                this.cy.style(buildStylesheet(styleConfig));
                this.cy.resize();
            }
            const cy = this.cy;
            const interactions = this.interactions;
            if (interactions) {
                // Allow Interactions: disable selection/keyboard actions when the host marks the visual read-only
                interactions.setAllowInteractions(this.host.hostCapabilities.allowInteractions !== false);
            }
            this.host.setCanDrill(true);

            // cache positions of existing nodes so slicer-driven refreshes do not reshuffle the bowtie;
            // the cache is dropped when the spacing settings change so reflows take effect
            const columnGap = Math.max(settings.nodesCard.nodeWidth.value + 60, settings.layoutCard.idealEdgeLength.value * 1.6);
            const laneSpacing = settings.bowtieCard.laneSpacing.value;
            const posKey = columnGap + "|" + laneSpacing;
            if (posKey !== this.positionCacheKey) {
                this.positionCache.clear();
                this.positionCacheKey = posKey;
            }
            cachePositions(cy, this.positionCache);
            cy.elements().remove();
            const elements = toCytoscapeElements(visibleGraph);
            const positions = computeBowtiePositions(visibleGraph, { columnGap: columnGap, laneSpacing: laneSpacing });
            for (const el of elements) {
                if (el.group === "nodes") {
                    const p = positions.get(String((el.data as { id?: string }).id));
                    if (p) {
                        el.position = { x: p.x, y: p.y };
                    }
                }
            }
            cy.add(elements);
            applyCachedPositions(cy, this.positionCache);
            this.addColumnHeaders(cy, settings, columnGap, laneSpacing);

            if (interactions) {
                interactions.setFocusOrder(visibleGraph.nodes.map(n => n.id));
                interactions.applyHighlight(visibleGraph.hasActiveHighlight);
            }

            const layout = runBowtieLayout(cy, {
                animate: settings.layoutCard.animate.value,
                fit: settings.layoutCard.fitOnLoad.value && !this.hasLayoutCompleted
            });
            layout.one("layoutstop", () => {
                this.hasLayoutCompleted = true;
                if (this.interactions) {
                    this.interactions.applySelectionFromManager();
                }
                this.events.renderingFinished(options);
            });

            this.renderLegend(visibleGraph, settings, settings.legendCard.showLegend.value);
        } catch (error) {
            console.log("Error in update method", error);
            this.events.renderingFailed(options, String(error));
        }
    }

    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values.
     * Called whenever the properties pane is opened or a format property is edited.
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        if (!this.formattingSettings) {
            this.formattingSettings = new VisualFormattingSettingsModel();
        }
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        if (this.cy) {
            this.cy.destroy();
            this.cy = undefined;
        }
    }

    private showEmptyState(state: "none" | "empty" | "landing"): void {
        this.emptyMessage.style.display = state === "empty" ? "flex" : "none";
        this.landingPage.style.display = state === "landing" ? "flex" : "none";
        this.cyContainer.style.visibility = state === "none" ? "visible" : "hidden";
        if (state !== "none") {
            this.noteMessage.style.display = "none";
        }
    }

    /** Bottom-left note for bowtie topology caveats (inferred centre, hidden off-bowtie nodes). */
    private updateTopologyNote(topology: BowtieTopology): void {
        const notes: string[] = [];
        if (topology.centreInferred && topology.topEventId) {
            notes.push(this.translate("Visual_NoHazard",
                "No 'Hazard'-typed artefact found — using '{0}' as the top event.").replace("{0}", topology.topEventId));
        }
        if (topology.hiddenNodeIds.length > 0) {
            notes.push(this.translate("Visual_HiddenNodes",
                "{0} artefact(s) lie outside the bowtie and are hidden.").replace("{0}", String(topology.hiddenNodeIds.length)));
        }
        this.noteMessage.textContent = notes.join(" ");
        this.noteMessage.style.display = notes.length > 0 ? "block" : "none";
    }

    /** Adds locked, non-interactive column captions above each populated bowtie column. */
    private addColumnHeaders(cy: cytoscape.Core, settings: VisualFormattingSettingsModel, columnGap: number, laneSpacing: number): void {
        if (!settings.bowtieCard.showColumnHeaders.value) {
            return;
        }
        const rankLabels: { rank: number; key: string; fallback: string }[] = [
            { rank: -2, key: "Bowtie_Header_CausalFactors", fallback: "Causal Factors" },
            { rank: -1, key: "Bowtie_Header_PreventiveControls", fallback: "Preventive Controls" },
            { rank: 0, key: "Bowtie_Header_TopEvent", fallback: "Hazard (Top Event)" },
            { rank: 1, key: "Bowtie_Header_MitigativeControls", fallback: "Mitigative Controls" },
            { rank: 2, key: "Bowtie_Header_Mishaps", fallback: "Mishaps" }
        ];
        const present = new Set<number>();
        let minY = Number.POSITIVE_INFINITY;
        cy.nodes().forEach(n => {
            const r = n.data("rank");
            if (r !== "" && r !== undefined && r !== null) {
                present.add(Number(r));
            }
            minY = Math.min(minY, n.position("y"));
        });
        if (!isFinite(minY)) {
            return;
        }
        const headerY = minY - laneSpacing * 0.8;
        for (const h of rankLabels) {
            if (!present.has(h.rank)) {
                continue;
            }
            cy.add({
                group: "nodes",
                classes: "column-header",
                data: { id: "__bowtie_hdr_" + h.rank, label: this.translate(h.key, h.fallback), highlighted: true },
                position: { x: h.rank * columnGap, y: headerY },
                locked: true,
                grabbable: false,
                selectable: false
            } as cytoscape.ElementDefinition);
        }
    }

    private buildStyleConfig(s: VisualFormattingSettingsModel): StyleConfig {
        const c = s.colorsCard;
        const palette = this.host.colorPalette;
        // High Contrast: draw using only theme foreground/background colours, per Power BI accessibility guidance
        const colours = palette.isHighContrast
            ? {
                document: palette.foreground.value,
                spec: palette.foreground.value,
                causalFactor: palette.foreground.value,
                hazard: palette.foreground.value,
                control: palette.foreground.value,
                mishap: palette.foreground.value,
                verification: palette.foreground.value,
                requirement: palette.foreground.value,
                otherNode: palette.foreground.value,
                derives: palette.hyperlink.value,
                causes: palette.hyperlink.value,
                mitigates: palette.hyperlink.value,
                resultsIn: palette.hyperlink.value,
                verifies: palette.hyperlink.value,
                allocates: palette.hyperlink.value,
                informs: palette.hyperlink.value,
                otherLink: palette.hyperlink.value,
                riskHigh: palette.foreground.value,
                riskSerious: palette.foreground.value,
                riskMedium: palette.foreground.value,
                riskLow: palette.foreground.value
            }
            : {
                document: c.documentColor.value.value,
                spec: c.specColor.value.value,
                causalFactor: c.causalFactorColor.value.value,
                hazard: c.hazardColor.value.value,
                control: c.controlColor.value.value,
                mishap: c.mishapColor.value.value,
                verification: c.verificationColor.value.value,
                requirement: c.requirementColor.value.value,
                otherNode: c.otherNodeColor.value.value,
                derives: c.derivesColor.value.value,
                causes: c.causesColor.value.value,
                mitigates: c.mitigatesColor.value.value,
                resultsIn: c.resultsInColor.value.value,
                verifies: c.verifiesColor.value.value,
                allocates: c.allocatesColor.value.value,
                informs: c.informsColor.value.value,
                otherLink: c.otherLinkColor.value.value,
                riskHigh: c.riskHighColor.value.value,
                riskSerious: c.riskSeriousColor.value.value,
                riskMedium: c.riskMediumColor.value.value,
                riskLow: c.riskLowColor.value.value
            };
        return {
            nodeWidth: s.nodesCard.nodeWidth.value,
            nodeHeight: s.nodesCard.nodeHeight.value,
            fontSize: s.nodesCard.fontSize.value,
            showIcons: s.nodesCard.showIcons.value,
            showClassification: s.nodesCard.showClassification.value,
            showCaveat: s.nodesCard.showCaveat.value,
            statusBorders: s.nodesCard.statusBorders.value,
            minZoomedFontSize: s.nodesCard.minZoomedFontSize.value,
            showEdgeLabels: s.linksCard.showEdgeLabels.value,
            edgeLabelFontSize: s.linksCard.edgeLabelFontSize.value,
            arrowScale: s.linksCard.arrowScale.value,
            curved: s.linksCard.curved.value,
            riskColoring: s.riskCard.riskColoring.value,
            showRiskBadge: s.riskCard.showRiskBadge.value,
            colours: colours,
            highContrast: palette.isHighContrast,
            foregroundColor: palette.foreground.value,
            backgroundColor: palette.background.value,
            selectedColor: palette.isHighContrast ? palette.foregroundSelected.value : "#111111"
        };
    }

    private renderLegend(graph: GraphModel, settings: VisualFormattingSettingsModel, visible: boolean): void {
        if (!this.legend) {
            this.legend = new LegendPanel(
                this.legendContainer,
                () => this.cy,
                (key, fallback) => this.translate(key, fallback));
        }
        const colours = this.lastStyleConfig ? this.lastStyleConfig.colours : this.buildStyleConfig(settings).colours;
        const typeCounts = new Map<string, number>();
        const programCounts = new Map<string, number>();
        for (const node of graph.nodes) {
            typeCounts.set(node.typeKey, (typeCounts.get(node.typeKey) || 0) + 1);
            if (node.program) {
                programCounts.set(node.program, (programCounts.get(node.program) || 0) + 1);
            }
        }
        // bowtie element order: causal factors → hazard → controls → mishaps, then legacy SE types
        const typeOrder = ["causalFactor", "hazard", "control", "mishap", "document", "spec", "verification", "requirement", "other"];
        const entries = Array.from(typeCounts.keys())
            .sort((a, b) => {
                const ia = typeOrder.indexOf(a);
                const ib = typeOrder.indexOf(b);
                const oa = ia < 0 ? typeOrder.length : ia;
                const ob = ib < 0 ? typeOrder.length : ib;
                return oa !== ob ? oa - ob : (a < b ? -1 : a > b ? 1 : 0);
            })
            .map(key => ({ key: key, label: this.typeKeyLabel(key), colour: typeColour(key, colours) }));
        this.legend.render(entries, graph.programs, typeCounts, programCounts, visible);
    }

    private typeKeyLabel(key: string): string {
        const map: Record<string, [string, string]> = {
            causalFactor: ["Type_CausalFactor", "Causal factor"],
            hazard: ["Type_Hazard", "Hazard"],
            control: ["Type_Control", "Control"],
            mishap: ["Type_Mishap", "Mishap"],
            document: ["Type_Document", "Document"],
            spec: ["Type_Specification", "Specification"],
            verification: ["Type_Verification", "Verification"],
            requirement: ["Type_Requirement", "Requirement"],
            other: ["Type_Other", "Other"]
        };
        const entry = map[key] || map.other;
        return this.translate(entry[0], entry[1]);
    }
}