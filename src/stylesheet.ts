/*
 * Cytoscape stylesheet builder. Maps graph data (artefact type, link type,
 * status, classification, caveat) to visual style, driven by format-pane
 * settings. Node icons are per-node generated SVG data-URIs (offline-safe).
 */

"use strict";

import cytoscape from "cytoscape";

import {
    getNodeIcon,
    statusStyle,
    ArtefactTypeKey,
    LinkTypeKey
} from "./icons";

export interface ColourConfig {
    document: string;
    spec: string;
    causalFactor: string;
    hazard: string;
    control: string;
    mishap: string;
    verification: string;
    requirement: string;
    otherNode: string;
    derives: string;
    causes: string;
    mitigates: string;
    resultsIn: string;
    verifies: string;
    allocates: string;
    informs: string;
    otherLink: string;
    riskHigh: string;
    riskSerious: string;
    riskMedium: string;
    riskLow: string;
}

export interface StyleConfig {
    nodeWidth: number;
    nodeHeight: number;
    fontSize: number;
    showIcons: boolean;
    showClassification: boolean;
    showCaveat: boolean;
    statusBorders: boolean;
    minZoomedFontSize: number;
    showEdgeLabels: boolean;
    edgeLabelFontSize: number;
    arrowScale: number;
    curved: boolean;
    /** colour hazard/mishap nodes by their assessed 882E risk level */
    riskColoring: boolean;
    /** draw an H/S/M/L risk badge on nodes with an assessed risk level */
    showRiskBadge: boolean;
    colours: ColourConfig;
    /** true when the report is running in Power BI's high-contrast accessibility mode */
    highContrast: boolean;
    foregroundColor: string;
    backgroundColor: string;
    selectedColor: string;
}

export function typeColour(typeKey: string, colours: ColourConfig): string {
    switch (typeKey as ArtefactTypeKey) {
        case "document": return colours.document;
        case "spec": return colours.spec;
        case "causalFactor": return colours.causalFactor;
        case "hazard": return colours.hazard;
        case "control": return colours.control;
        case "mishap": return colours.mishap;
        case "verification": return colours.verification;
        case "requirement": return colours.requirement;
        default: return colours.otherNode;
    }
}

export function linkColour(linkKey: string, colours: ColourConfig): string {
    switch (linkKey as LinkTypeKey) {
        case "derives": return colours.derives;
        case "causes": return colours.causes;
        case "mitigates": return colours.mitigates;
        case "resultsIn": return colours.resultsIn;
        case "verifies": return colours.verifies;
        case "allocates": return colours.allocates;
        case "informs": return colours.informs;
        default: return colours.otherLink;
    }
}

/** Colour for an assessed 882E risk level ("" when the level is unknown/absent). */
export function riskColour(riskLevel: string, colours: ColourConfig): string {
    switch (riskLevel) {
        case "High": return colours.riskHigh;
        case "Serious": return colours.riskSerious;
        case "Medium": return colours.riskMedium;
        case "Low": return colours.riskLow;
        default: return "";
    }
}

/** Stylesheet[] type recovered via indexed access (the `Stylesheet` alias is not exported by @types/cytoscape). */
export type CytoscapeStyles = Exclude<NonNullable<cytoscape.CytoscapeOptions["style"]>, Promise<unknown>>;

/** Builds the full Cytoscape stylesheet for the current settings. */
export function buildStylesheet(o: StyleConfig): CytoscapeStyles {
    const nodeStyle = {
        "shape": "round-rectangle",
        "width": o.nodeWidth,
        "height": o.nodeHeight,
        // precedence: conditional-formatting override > 882E risk colouring > type colour
        "background-color": (ele: cytoscape.NodeSingular) =>
            ele.data("fillOverride")
            || (o.riskColoring ? riskColour(ele.data("riskLevel") || "", o.colours) : "")
            || typeColour(ele.data("typeKey"), o.colours),
        "background-image": (ele: cytoscape.NodeSingular) => {
            const level = ele.data("riskLevel") || "";
            return getNodeIcon({
                width: o.nodeWidth,
                height: o.nodeHeight,
                typeKey: ele.data("typeKey") || "other",
                classification: o.showClassification ? (ele.data("classification") || "") : "",
                caveat: o.showCaveat ? (ele.data("caveat") || "") : "",
                showIcons: o.showIcons,
                showClassification: o.showClassification,
                showCaveat: o.showCaveat,
                riskLevel: o.showRiskBadge ? level : "",
                riskColor: riskColour(level, o.colours),
                showRiskBadge: o.showRiskBadge
            });
        },
        "background-width": o.nodeWidth,
        "background-height": o.nodeHeight,
        "background-fit": "none",
        "background-clip": "none",
        "background-image-opacity": 1,
        "label": "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        "color": (_ele: cytoscape.NodeSingular) => o.highContrast ? o.foregroundColor : "#333333",
        "font-size": o.fontSize,
        "font-family": "Segoe UI, Arial, sans-serif",
        "font-weight": "bold",
        "text-wrap": "wrap",
        "text-max-width": o.nodeWidth * 1.3,
        "min-zoomed-font-size": o.minZoomedFontSize,
        "border-width": 2,
        "border-style": (ele: cytoscape.NodeSingular) => o.statusBorders ? statusStyle(ele.data("status")).line : "solid",
        "border-color": (ele: cytoscape.NodeSingular) => o.statusBorders ? statusStyle(ele.data("status")).color : (o.highContrast ? o.foregroundColor : "#424242")
    } as unknown as cytoscape.Css.Node;

    const edgeStyle = {
        "curve-style": o.curved ? "bezier" : "straight",
        "width": 2,
        "line-color": (ele: cytoscape.EdgeSingular) => linkColour(ele.data("linkKey"), o.colours),
        "target-arrow-color": (ele: cytoscape.EdgeSingular) => linkColour(ele.data("linkKey"), o.colours),
        "target-arrow-shape": "triangle",
        "arrow-scale": o.arrowScale,
        "label": o.showEdgeLabels ? "data(linkType)" : "",
        "font-size": o.edgeLabelFontSize,
        "font-family": "Segoe UI, Arial, sans-serif",
        "color": o.highContrast ? o.foregroundColor : "#555555",
        "text-rotation": "autorotate",
        "text-background-color": o.backgroundColor,
        "text-background-opacity": 0.75,
        "text-background-padding": "2px",
        "min-zoomed-font-size": o.minZoomedFontSize
    } as unknown as cytoscape.Css.Edge;

    const dimmedStyle = {
        "opacity": 0.08,
        "events": "no"
    } as unknown as cytoscape.Css.Node;

    const unhighlightedStyle = {
        "opacity": 0.15
    } as unknown as cytoscape.Css.Node;

    const selectedStyle = {
        "border-width": 4,
        "border-color": o.selectedColor,
        "overlay-color": o.selectedColor,
        "overlay-opacity": 0.08
    } as unknown as cytoscape.Css.Node;

    const edgeSelectedStyle = {
        "width": 4,
        "overlay-color": o.selectedColor,
        "overlay-opacity": 0.08
    } as unknown as cytoscape.Css.Edge;

    const keyboardFocusStyle = {
        "border-width": 4,
        "border-color": o.highContrast ? o.foregroundColor : "#1565C0",
        "border-style": "double"
    } as unknown as cytoscape.Css.Node;

    // locked, non-interactive column captions ("Causal Factors" … "Mishaps")
    const columnHeaderStyle = {
        "shape": "rectangle",
        "width": 10,
        "height": 10,
        "background-opacity": 0,
        "border-width": 0,
        "label": "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-margin-y": 0,
        "color": o.highContrast ? o.foregroundColor : "#666666",
        "font-size": Math.max(12, o.fontSize + 2),
        "font-weight": "bold",
        "text-wrap": "wrap",
        "text-max-width": 220,
        "min-zoomed-font-size": o.minZoomedFontSize,
        "events": "no"
    } as unknown as cytoscape.Css.Node;

    return [
        { selector: "node", style: nodeStyle },
        { selector: "edge", style: edgeStyle },
        { selector: ".column-header", style: columnHeaderStyle },
        { selector: ".dimmed", style: dimmedStyle },
        { selector: ".unhighlighted", style: unhighlightedStyle },
        { selector: "node:selected", style: selectedStyle },
        { selector: "edge:selected", style: edgeSelectedStyle },
        { selector: ".kbd-focus", style: keyboardFocusStyle }
    ];
}
