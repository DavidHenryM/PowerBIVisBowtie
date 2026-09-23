"use strict";

import powerbi from "powerbi-visuals-api";
import cytoscape from "cytoscape";
import DataView = powerbi.DataView;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;

import { buildExplicitGraph } from "./explicitModel";

export type BowtieSide = "left" | "centre" | "right";
export type SeverityCategory = "I" | "II" | "III" | "IV";
export type ProbabilityLevel = "A" | "B" | "C" | "D" | "E" | "F";
export type RiskLevel = "High" | "Serious" | "Medium" | "Low";
export type ControlSet = "initial" | "additional";
export type BowtieNodeKind = "cause" | "preventiveControl" | "hazard" | "mitigatingControl" | "effect" | "risk";

export interface ArtefactNode {
    id: string;
    semanticId?: string;
    label: string;
    type: string;
    typeKey: string;
    nodeKind?: BowtieNodeKind;
    controlSet?: ControlSet;
    tooltip?: string;
    hierarchy?: string;
    verificationMethods?: string[];
    verificationPhases?: string[];
    selectable?: boolean;
    program: string;
    classification: string;
    caveat: string;
    status: string;
    selectionId?: ISelectionId;
    highlighted: boolean;
    fillOverride?: string;
    url?: string;
    shortName: string;
    longName: string;
    scope: string;
    version: string;
    externalId: string;
    dmsId: string;
    severity: string;
    probability: string;
    severityCategory?: SeverityCategory;
    probabilityLevel?: ProbabilityLevel;
    riskLevel?: RiskLevel;
    side?: BowtieSide;
    rank?: number;
    lane?: number;
    flowRank?: number;
    pathKey?: string;
    riskStage?: "before" | "intermediate" | "after";
    resultantRisk?: boolean;
    bowtieRole?: string;
}

export interface ArtefactLink {
    id: string;
    source: string;
    target: string;
    linkType: string;
    linkKey: string;
    highlighted: boolean;
    controlSet?: ControlSet;
    bypass?: boolean;
}

export interface GraphModel {
    nodes: ArtefactNode[];
    links: ArtefactLink[];
    types: string[];
    programs: string[];
    hasActiveHighlight: boolean;
    hazardIds?: string[];
    controlSets?: ControlSet[];
    issues?: string[];
}

export function buildGraph(dataView: DataView, host: IVisualHost): GraphModel {
    return buildExplicitGraph(dataView, host);
}

export function toCytoscapeElements(graph: GraphModel): cytoscape.ElementDefinition[] {
    const hasMultipleControlSets = graph.nodes.some(node => node.controlSet === "initial")
        && graph.nodes.some(node => node.controlSet === "additional");

    const elements: cytoscape.ElementDefinition[] = graph.nodes.map(node => ({
        group: "nodes",
        data: {
            id: node.id,
            semanticId: node.semanticId || node.id,
            label: node.nodeKind === "hazard"
                ? (node.label || node.semanticId || node.id) + "\n" + (node.semanticId || node.id)
                : hasMultipleControlSets && node.controlSet
                    ? (node.controlSet === "initial" ? "Initial: " : "Additional: ") + (node.label || "")
                    : node.label,
            type: node.type,
            typeKey: node.typeKey,
            nodeKind: node.nodeKind || "",
            controlSet: node.controlSet || "",
            tooltip: node.tooltip || "",
            hierarchy: node.hierarchy || "",
            verificationMethods: node.verificationMethods || [],
            verificationPhases: node.verificationPhases || [],
            verificationMethodText: (node.verificationMethods || []).join(", "),
            verificationPhaseText: (node.verificationPhases || []).join(", "),
            selectable: node.selectable !== false,
            program: node.program,
            classification: node.classification,
            caveat: node.caveat,
            status: node.status,
            highlighted: node.highlighted,
            fillOverride: node.fillOverride || "",
            url: node.url || "",
            shortName: node.shortName,
            longName: node.longName,
            scope: node.scope,
            version: node.version,
            externalId: node.externalId,
            dmsId: node.dmsId,
            severity: node.severity,
            probability: node.probability,
            severityCategory: node.severityCategory || "",
            probabilityLevel: node.probabilityLevel || "",
            riskLevel: node.riskLevel || "",
            side: node.side || "",
            bowtieRole: node.bowtieRole || "",
            rank: node.rank === undefined ? "" : node.rank,
            lane: node.lane === undefined ? "" : node.lane,
            flowRank: node.flowRank === undefined ? "" : node.flowRank,
            pathKey: node.pathKey || "",
            riskStage: node.riskStage || "",
            resultantRisk: node.resultantRisk === true
        }
    } as cytoscape.ElementDefinition));
    for (const link of graph.links) {
        elements.push({
            group: "edges",
            data: {
                id: link.id,
                source: link.source,
                target: link.target,
                linkType: link.linkType,
                linkKey: link.linkKey,
                highlighted: link.highlighted,
                controlSet: link.controlSet || "",
                bypass: link.bypass === true
            }
        } as cytoscape.ElementDefinition);
    }
    return elements;
}
