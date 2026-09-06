/*
 * Data model: parses the categorical DataView (one row per relationship)
 * into a de-duplicated node/link graph for Cytoscape.
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import cytoscape from "cytoscape";
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;

import { normaliseTypeKey, normaliseLinkKey } from "./icons";

/** Bowtie side of a node, derived from link direction relative to the top event. */
export type BowtieSide = "left" | "centre" | "right";
/** MIL-STD-882E Table I severity categories. */
export type SeverityCategory = "I" | "II" | "III" | "IV";
/** MIL-STD-882E Table II probability levels. */
export type ProbabilityLevel = "A" | "B" | "C" | "D" | "E" | "F";
/** MIL-STD-882E Table III assessed mishap risk levels. */
export type RiskLevel = "High" | "Serious" | "Medium" | "Low";

export interface ArtefactNode {
    id: string;
    label: string;
    type: string;
    typeKey: string;
    program: string;
    classification: string;
    caveat: string;
    status: string;
    selectionId?: ISelectionId;
    /** true when not cross-highlighted-out; always true if the report has no active highlight */
    highlighted: boolean;
    /** conditional-formatting rule colour ("dataPoint.fill"), overrides the type-based colour when set */
    fillOverride?: string;
    /** optional link to open the artefact (Source URL / Target URL role) */
    url?: string;
    shortName: string;
    longName: string;
    /** e.g. "Contractor 1", "Internal" */
    scope: string;
    version: string;
    externalId: string;
    dmsId: string;
    /** raw MIL-STD-882E severity value (Source/Target Severity role) */
    severity: string;
    /** raw MIL-STD-882E probability value (Source/Target Probability role) */
    probability: string;
    /** parsed 882E severity category — set by deriveBowtieTopology */
    severityCategory?: SeverityCategory;
    /** parsed 882E probability level — set by deriveBowtieTopology */
    probabilityLevel?: ProbabilityLevel;
    /** assessed mishap risk per 882E Table III — set by deriveBowtieTopology */
    riskLevel?: RiskLevel;
    /** bowtie side — set by deriveBowtieTopology; undefined = outside the bowtie */
    side?: BowtieSide;
    /** layout column: -2 causal factors, -1 preventive controls, 0 top event, +1 mitigative controls, +2 mishaps */
    rank?: number;
    /** layout lane within the column (0 = centre line through the top event) */
    lane?: number;
    /** bowtie role label for tooltips, e.g. "Preventive control" */
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
    /** distinct raw artefact type values present (for the legend) */
    types: string[];
    /** distinct program values present (for the legend) */
    programs: string[];
    /** true when another visual/slicer is actively cross-highlighting this one */
    hasActiveHighlight: boolean;
}

const ROLE = {
    sourceId: "sourceId",
    targetId: "targetId",
    linkType: "linkType",
    sourceType: "sourceType",
    targetType: "targetType",
    sourceProgram: "sourceProgram",
    targetProgram: "targetProgram",
    sourceClassification: "sourceClassification",
    targetClassification: "targetClassification",
    sourceCaveat: "sourceCaveat",
    targetCaveat: "targetCaveat",
    sourceStatus: "sourceStatus",
    targetStatus: "targetStatus",
    sourceUrl: "sourceUrl",
    targetUrl: "targetUrl",
    sourceShortName: "sourceShortName",
    targetShortName: "targetShortName",
    sourceLongName: "sourceLongName",
    targetLongName: "targetLongName",
    sourceScope: "sourceScope",
    targetScope: "targetScope",
    sourceVersion: "sourceVersion",
    targetVersion: "targetVersion",
    sourceExternalId: "sourceExternalId",
    targetExternalId: "targetExternalId",
    sourceDmsId: "sourceDmsId",
    targetDmsId: "targetDmsId",
    sourceSeverity: "sourceSeverity",
    targetSeverity: "targetSeverity",
    sourceProbability: "sourceProbability",
    targetProbability: "targetProbability",
    highlightMeasure: "highlightMeasure"
} as const;

function findRoleColumn(categories: DataViewCategoryColumn[], role: string): number {
    return categories.findIndex(c => c.source && c.source.roles && c.source.roles[role]);
}

function textValue(column: DataViewCategoryColumn | undefined, row: number): string {
    if (!column) {
        return "";
    }
    const v = column.values[row];
    if (v === null || v === undefined) {
        return "";
    }
    return String(v).trim();
}

/** Reads a conditional-formatting rule colour ("dataPoint.fill") attached to a category row, if any. */
function fillOverrideValue(column: DataViewCategoryColumn, row: number): string | undefined {
    const objects = column.objects;
    const dataPoint = objects && objects[row] && objects[row]["dataPoint"];
    const fill = dataPoint && (dataPoint["fill"] as { solid?: { color?: string } } | undefined);
    return fill && fill.solid && fill.solid.color ? fill.solid.color : undefined;
}

/**
 * Builds the graph from the DataView. Returns an empty graph when the
 * mandatory sourceId/targetId roles are not bound.
 */
export function buildGraph(dataView: DataView, host: IVisualHost): GraphModel {
    const empty: GraphModel = { nodes: [], links: [], types: [], programs: [], hasActiveHighlight: false };
    const categorical = dataView && dataView.categorical;
    if (!categorical || !categorical.categories || categorical.categories.length === 0) {
        return empty;
    }

    const categories = categorical.categories;
    const colSourceId = findRoleColumn(categories, ROLE.sourceId);
    const colTargetId = findRoleColumn(categories, ROLE.targetId);
    if (colSourceId < 0 || colTargetId < 0) {
        return empty;
    }

    // optional cross-highlight support: bound via the "Highlight measure" role
    const highlightColumn = categorical.values && categorical.values.length > 0
        ? categorical.values.filter(v => v.source && v.source.roles && v.source.roles[ROLE.highlightMeasure])[0]
        : undefined;
    const highlights = highlightColumn ? highlightColumn.highlights : undefined;
    const rowHighlighted = (row: number): boolean => !highlights || highlights[row] !== null && highlights[row] !== undefined;

    const colLinkType = findRoleColumn(categories, ROLE.linkType);
    const colAt = (role: string) => {
        const idx = findRoleColumn(categories, role);
        return idx >= 0 ? categories[idx] : undefined;
    };

    interface EndpointColumns {
        type?: DataViewCategoryColumn;
        program?: DataViewCategoryColumn;
        classification?: DataViewCategoryColumn;
        caveat?: DataViewCategoryColumn;
        status?: DataViewCategoryColumn;
        url?: DataViewCategoryColumn;
        shortName?: DataViewCategoryColumn;
        longName?: DataViewCategoryColumn;
        scope?: DataViewCategoryColumn;
        version?: DataViewCategoryColumn;
        externalId?: DataViewCategoryColumn;
        dmsId?: DataViewCategoryColumn;
        severity?: DataViewCategoryColumn;
        probability?: DataViewCategoryColumn;
    }

    const sourceCols: EndpointColumns = {
        type: colAt(ROLE.sourceType),
        program: colAt(ROLE.sourceProgram),
        classification: colAt(ROLE.sourceClassification),
        caveat: colAt(ROLE.sourceCaveat),
        status: colAt(ROLE.sourceStatus),
        url: colAt(ROLE.sourceUrl),
        shortName: colAt(ROLE.sourceShortName),
        longName: colAt(ROLE.sourceLongName),
        scope: colAt(ROLE.sourceScope),
        version: colAt(ROLE.sourceVersion),
        externalId: colAt(ROLE.sourceExternalId),
        dmsId: colAt(ROLE.sourceDmsId),
        severity: colAt(ROLE.sourceSeverity),
        probability: colAt(ROLE.sourceProbability)
    };
    const targetCols: EndpointColumns = {
        type: colAt(ROLE.targetType),
        program: colAt(ROLE.targetProgram),
        classification: colAt(ROLE.targetClassification),
        caveat: colAt(ROLE.targetCaveat),
        status: colAt(ROLE.targetStatus),
        url: colAt(ROLE.targetUrl),
        shortName: colAt(ROLE.targetShortName),
        longName: colAt(ROLE.targetLongName),
        scope: colAt(ROLE.targetScope),
        version: colAt(ROLE.targetVersion),
        externalId: colAt(ROLE.targetExternalId),
        dmsId: colAt(ROLE.targetDmsId),
        severity: colAt(ROLE.targetSeverity),
        probability: colAt(ROLE.targetProbability)
    };

    const rowCount = categories[colSourceId].values.length;

    const nodeMap = new Map<string, ArtefactNode>();
    const links: ArtefactLink[] = [];
    const seenLinks = new Set<string>();
    const types = new Set<string>();
    const programs = new Set<string>();

    const ensureNode = (
        id: string,
        cols: EndpointColumns,
        identityCol: DataViewCategoryColumn,
        row: number
    ): ArtefactNode => {
        const existing = nodeMap.get(id);
        if (existing) {
            // a node already touched by a highlighted row stays highlighted
            existing.highlighted = existing.highlighted || rowHighlighted(row);
            return existing;
        }
        const type = textValue(cols.type, row);
        const program = textValue(cols.program, row);
        const node: ArtefactNode = {
            id: id,
            label: id,
            type: type,
            typeKey: normaliseTypeKey(type),
            program: program,
            classification: textValue(cols.classification, row),
            caveat: textValue(cols.caveat, row),
            status: textValue(cols.status, row),
            selectionId: host.createSelectionIdBuilder()
                .withCategory(identityCol, row)
                .createSelectionId(),
            highlighted: rowHighlighted(row),
            fillOverride: fillOverrideValue(identityCol, row),
            url: textValue(cols.url, row) || undefined,
            shortName: textValue(cols.shortName, row),
            longName: textValue(cols.longName, row),
            scope: textValue(cols.scope, row),
            version: textValue(cols.version, row),
            externalId: textValue(cols.externalId, row),
            dmsId: textValue(cols.dmsId, row),
            severity: textValue(cols.severity, row),
            probability: textValue(cols.probability, row)
        };
        nodeMap.set(id, node);
        if (type) {
            types.add(type);
        }
        if (program) {
            programs.add(program);
        }
        return node;
    };

    for (let row = 0; row < rowCount; row++) {
        const source = textValue(categories[colSourceId], row);
        const target = textValue(categories[colTargetId], row);
        if (!source || !target) {
            continue;
        }

        ensureNode(source, sourceCols, categories[colSourceId], row);
        ensureNode(target, targetCols, categories[colTargetId], row);

        const linkType = colLinkType >= 0 ? textValue(categories[colLinkType], row) : "related";
        const effectiveType = linkType || "related";
        const linkKey = source + "|" + target + "|" + effectiveType;
        if (seenLinks.has(linkKey)) {
            continue;
        }
        seenLinks.add(linkKey);
        links.push({
            id: "e" + links.length,
            source: source,
            target: target,
            linkType: effectiveType,
            linkKey: normaliseLinkKey(effectiveType),
            highlighted: rowHighlighted(row)
        });
    }

    return {
        nodes: Array.from(nodeMap.values()),
        links: links,
        types: Array.from(types).sort(),
        programs: Array.from(programs).sort(),
        hasActiveHighlight: !!highlights
    };
}

/** Maps the graph model to Cytoscape elements JSON. */
export function toCytoscapeElements(graph: GraphModel): cytoscape.ElementDefinition[] {
    const elements: cytoscape.ElementDefinition[] = [];
    for (const node of graph.nodes) {
        elements.push({
            group: "nodes",
            data: {
                id: node.id,
                label: node.label,
                type: node.type,
                typeKey: node.typeKey,
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
        } as cytoscape.ElementDefinition);
    }
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
