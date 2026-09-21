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
export type ControlSet = "initial" | "target";
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
    bowtieRole?: string;
}

export interface ArtefactLink {
    id: string;
    source: string;
    target: string;
    linkType: string;
    linkKey: string;
    highlighted: boolean;
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
    const elements: cytoscape.ElementDefinition[] = graph.nodes.map(node => ({
        group: "nodes",
        data: {
            id: node.id,
            semanticId: node.semanticId || node.id,
            label: node.label,
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
            lane: node.lane === undefined ? "" : node.lane
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
                highlighted: link.highlighted
            }
        } as cytoscape.ElementDefinition);
    }
    return elements;
}
