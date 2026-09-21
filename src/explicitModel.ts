"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;

import { normaliseLinkKey, normaliseTypeKey } from "./icons";

type ControlSet = "initial" | "target";
type DataKind = "cause" | "preventiveControl" | "hazard" | "mitigatingControl" | "effect";
interface ExplicitNode {
    id: string; semanticId: string; label: string; type: string; typeKey: string;
    nodeKind: DataKind | "risk"; controlSet: ControlSet; tooltip: string; hierarchy: string;
    verificationMethods: string[]; verificationPhases: string[];
    selectable: boolean; selectionId?: ISelectionId; highlighted: boolean; fillOverride?: string;
    program: string; classification: string; caveat: string; status: string; shortName: string;
    longName: string; scope: string; version: string; externalId: string; dmsId: string;
    severity: string; probability: string; bowtieRole?: string;
}
interface ExplicitLink {
    id: string; source: string; target: string; linkType: string; linkKey: string; highlighted: boolean;
}

const ROLE = {
    controlSet: "controlSet",
    causeId: "causeId", causeName: "causeName", causeTooltip: "causeTooltip",
    preventiveControlId: "preventiveControlId", preventiveControlName: "preventiveControlName",
    preventiveControlTooltip: "preventiveControlTooltip", preventiveControlHierarchy: "preventiveControlHierarchy",
    preventiveVerificationMethod: "preventiveVerificationMethod", preventiveVerificationPhase: "preventiveVerificationPhase",
    hazardId: "hazardId", hazardName: "hazardName", hazardTooltip: "hazardTooltip",
    mitigatingControlId: "mitigatingControlId", mitigatingControlName: "mitigatingControlName",
    mitigatingControlTooltip: "mitigatingControlTooltip", mitigatingControlHierarchy: "mitigatingControlHierarchy",
    mitigatingVerificationMethod: "mitigatingVerificationMethod", mitigatingVerificationPhase: "mitigatingVerificationPhase",
    effectId: "effectId", effectName: "effectName", effectTooltip: "effectTooltip",
    preventiveBeforeSeverity: "preventiveBeforeSeverity", preventiveBeforeProbability: "preventiveBeforeProbability",
    preventiveAfterSeverity: "preventiveAfterSeverity", preventiveAfterProbability: "preventiveAfterProbability",
    mitigatingBeforeSeverity: "mitigatingBeforeSeverity", mitigatingBeforeProbability: "mitigatingBeforeProbability",
    mitigatingAfterSeverity: "mitigatingAfterSeverity", mitigatingAfterProbability: "mitigatingAfterProbability",
    highlightMeasure: "highlightMeasure"
} as const;

type RoleName = keyof typeof ROLE;

function roleColumn(categories: DataViewCategoryColumn[], role: string): DataViewCategoryColumn | undefined {
    return categories.find(column => column.source && column.source.roles && column.source.roles[role]);
}

function text(column: DataViewCategoryColumn | undefined, row: number): string {
    const value = column && column.values[row];
    return value === null || value === undefined ? "" : String(value).trim();
}

function mergeValues(target: string[], raw: string): void {
    const existing = new Set(target.map(value => value.toLocaleLowerCase()));
    for (const value of raw.split(/[,;|]/).map(item => item.trim()).filter(item => !!item)) {
        const key = value.toLocaleLowerCase();
        if (!existing.has(key)) {
            target.push(value);
            existing.add(key);
        }
    }
    target.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function controlSet(raw: string): ControlSet | undefined {
    const value = raw.toLowerCase();
    if (value === "initial" || value === "current" || value === "existing") return "initial";
    if (value === "target" || value === "proposed" || value === "future") return "target";
    return undefined;
}

function fillOverride(column: DataViewCategoryColumn, row: number): string | undefined {
    const objects = column.objects;
    const dataPoint = objects && objects[row] && objects[row]["dataPoint"];
    const fill = dataPoint && (dataPoint["fill"] as { solid?: { color?: string } } | undefined);
    return fill && fill.solid && fill.solid.color ? fill.solid.color : undefined;
}

export function buildExplicitGraph(dataView: DataView, host: IVisualHost) {
    const empty = { nodes: [] as ExplicitNode[], links: [] as ExplicitLink[], types: [] as string[], programs: [] as string[], hasActiveHighlight: false, hazardIds: [] as string[], controlSets: [] as ControlSet[], issues: [] as string[] };
    const categorical = dataView.categorical;
    if (!categorical || !categorical.categories) return empty;

    const categories = categorical.categories;
    const columns = {} as Record<RoleName, DataViewCategoryColumn | undefined>;
    (Object.keys(ROLE) as RoleName[]).forEach(key => { columns[key] = roleColumn(categories, ROLE[key]); });
    if (!columns.controlSet || !columns.hazardId) return empty;

    const highlightColumn = categorical.values && categorical.values.find((value: { source?: { roles?: Record<string, boolean> } }) =>
        value.source && value.source.roles && value.source.roles[ROLE.highlightMeasure]);
    const highlights = highlightColumn && highlightColumn.highlights;
    const highlighted = (row: number) => !highlights || highlights[row] !== null && highlights[row] !== undefined;
    const nodeMap = new Map<string, ExplicitNode>();
    const links: ExplicitLink[] = [];
    const linkKeys = new Set<string>();
    const hazardIds = new Set<string>();
    const controlSets = new Set<ControlSet>();
    const issues = new Set<string>();

    const ensureNode = (set: ControlSet, kind: DataKind, semanticId: string, name: string, tooltip: string,
        hierarchy: string, verificationMethods: string, verificationPhases: string,
        identityColumn: DataViewCategoryColumn, row: number): ExplicitNode => {
        const id = set + "|" + kind + "|" + semanticId;
        const existing = nodeMap.get(id);
        if (existing) {
            existing.highlighted = existing.highlighted || highlighted(row);
            if (!existing.tooltip) existing.tooltip = tooltip;
            if (!existing.hierarchy) existing.hierarchy = hierarchy;
            mergeValues(existing.verificationMethods, verificationMethods);
            mergeValues(existing.verificationPhases, verificationPhases);
            return existing;
        }
        const types: Record<DataKind, string> = {
            cause: "Cause", preventiveControl: "Preventive Control", hazard: "Hazard",
            mitigatingControl: "Mitigating Control", effect: "Effect"
        };
        const type = types[kind];
        const node: ExplicitNode = {
            id, semanticId, label: name || semanticId, type, typeKey: normaliseTypeKey(type), nodeKind: kind,
            controlSet: set, tooltip, hierarchy, verificationMethods: [], verificationPhases: [], selectable: true,
            selectionId: host.createSelectionIdBuilder().withCategory(identityColumn, row).createSelectionId(),
            highlighted: highlighted(row), fillOverride: fillOverride(identityColumn, row),
            program: "", classification: "", caveat: "", status: "", shortName: name, longName: name,
            scope: "", version: "", externalId: "", dmsId: "", severity: "", probability: ""
        };
        mergeValues(node.verificationMethods, verificationMethods);
        mergeValues(node.verificationPhases, verificationPhases);
        nodeMap.set(id, node);
        return node;
    };

    const ensureRisk = (set: ControlSet, controlKind: "preventive" | "mitigating", controlId: string,
        position: "before" | "after", severity: string, probability: string, row: number): ExplicitNode => {
        const semanticId = controlKind + "|" + controlId + "|" + position;
        const id = set + "|risk|" + semanticId;
        const existing = nodeMap.get(id);
        if (existing) {
            existing.highlighted = existing.highlighted || highlighted(row);
            if ((!existing.severity && severity) || (!existing.probability && probability)) {
                existing.severity = existing.severity || severity;
                existing.probability = existing.probability || probability;
            }
            return existing;
        }
        const node: ExplicitNode = {
            id, semanticId, label: "Not assessed", type: "Risk", typeKey: "other", nodeKind: "risk",
            controlSet: set, tooltip: "", hierarchy: "", verificationMethods: [], verificationPhases: [], selectable: false, highlighted: highlighted(row),
            program: "", classification: "", caveat: "", status: "", shortName: position === "before" ? "Before control" : "After control",
            longName: "", scope: "", version: "", externalId: "", dmsId: "", severity, probability,
            bowtieRole: (position === "before" ? "Risk before " : "Risk after ") + controlKind + " control"
        };
        nodeMap.set(id, node);
        return node;
    };

    const addLink = (source: ExplicitNode, target: ExplicitNode, type: string, row: number) => {
        const key = source.id + "|" + target.id + "|" + type;
        if (linkKeys.has(key)) return;
        linkKeys.add(key);
        links.push({ id: "e" + links.length, source: source.id, target: target.id, linkType: type,
            linkKey: normaliseLinkKey(type), highlighted: highlighted(row) });
    };

    for (let row = 0; row < columns.hazardId.values.length; row++) {
        const hazardId = text(columns.hazardId, row);
        if (!hazardId) continue;
        hazardIds.add(hazardId);
        const set = controlSet(text(columns.controlSet, row));
        if (!set) { issues.add("Rows with an unknown Control Set were ignored."); continue; }
        controlSets.add(set);
        const hazard = ensureNode(set, "hazard", hazardId, text(columns.hazardName, row), text(columns.hazardTooltip, row), "", "", "", columns.hazardId, row);

        const causeId = text(columns.causeId, row);
        const preventiveId = text(columns.preventiveControlId, row);
        if (causeId && preventiveId && columns.causeId && columns.preventiveControlId) {
            const cause = ensureNode(set, "cause", causeId, text(columns.causeName, row), text(columns.causeTooltip, row), "", "", "", columns.causeId, row);
            const control = ensureNode(set, "preventiveControl", preventiveId, text(columns.preventiveControlName, row),
                text(columns.preventiveControlTooltip, row), text(columns.preventiveControlHierarchy, row),
                text(columns.preventiveVerificationMethod, row), text(columns.preventiveVerificationPhase, row), columns.preventiveControlId, row);
            const before = ensureRisk(set, "preventive", preventiveId, "before",
                text(columns.preventiveBeforeSeverity, row), text(columns.preventiveBeforeProbability, row), row);
            const after = ensureRisk(set, "preventive", preventiveId, "after",
                text(columns.preventiveAfterSeverity, row), text(columns.preventiveAfterProbability, row), row);
            addLink(cause, before, "exposes", row);
            addLink(before, control, "treated by", row);
            addLink(control, after, "reduces to", row);
            addLink(after, hazard, "prevents", row);
        } else if (causeId || preventiveId) issues.add("Incomplete preventive-control rows were ignored.");

        const mitigatingId = text(columns.mitigatingControlId, row);
        const effectId = text(columns.effectId, row);
        if (mitigatingId && effectId && columns.mitigatingControlId && columns.effectId) {
            const control = ensureNode(set, "mitigatingControl", mitigatingId, text(columns.mitigatingControlName, row),
                text(columns.mitigatingControlTooltip, row), text(columns.mitigatingControlHierarchy, row),
                text(columns.mitigatingVerificationMethod, row), text(columns.mitigatingVerificationPhase, row), columns.mitigatingControlId, row);
            const effect = ensureNode(set, "effect", effectId, text(columns.effectName, row), text(columns.effectTooltip, row), "", "", "", columns.effectId, row);
            const before = ensureRisk(set, "mitigating", mitigatingId, "before",
                text(columns.mitigatingBeforeSeverity, row), text(columns.mitigatingBeforeProbability, row), row);
            const after = ensureRisk(set, "mitigating", mitigatingId, "after",
                text(columns.mitigatingAfterSeverity, row), text(columns.mitigatingAfterProbability, row), row);
            addLink(hazard, before, "exposes", row);
            addLink(before, control, "treated by", row);
            addLink(control, after, "reduces to", row);
            addLink(after, effect, "mitigates", row);
        } else if (mitigatingId || effectId) issues.add("Incomplete mitigating-control rows were ignored.");
    }

    return {
        nodes: Array.from(nodeMap.values()), links,
        types: ["Cause", "Preventive Control", "Hazard", "Mitigating Control", "Effect"], programs: [],
        hasActiveHighlight: !!highlights, hazardIds: Array.from(hazardIds).sort(),
        controlSets: Array.from(controlSets).sort(), issues: Array.from(issues)
    };
}