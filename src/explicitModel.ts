"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;

import { normaliseLinkKey, normaliseTypeKey } from "./icons";
import { RiskLevel } from "./model";

type ControlSet = "initial" | "additional";
type DataKind = "cause" | "preventiveControl" | "hazard" | "mitigatingControl" | "effect";
interface ExplicitNode {
    id: string; semanticId: string; label: string; type: string; typeKey: string;
    nodeKind: DataKind | "risk"; controlSet?: ControlSet; tooltip: string; hierarchy: string;
    verificationMethods: string[]; verificationPhases: string[];
    selectable: boolean; selectionId?: ISelectionId; highlighted: boolean; fillOverride?: string;
    program: string; classification: string; caveat: string; status: string; shortName: string;
    longName: string; scope: string; version: string; externalId: string; dmsId: string;
    severity: string; probability: string; riskLevel?: RiskLevel; flowRank?: number; pathKey?: string;
    riskStage?: "before" | "intermediate" | "after"; resultantRisk?: boolean; bowtieRole?: string;
}
interface ExplicitLink {
    id: string; source: string; target: string; linkType: string; linkKey: string; highlighted: boolean;
    controlSet?: ControlSet; bypass?: boolean;
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
    preventiveBeforeSeverity: "preventiveBeforeSeverity", preventiveBeforeProbability: "preventiveBeforeProbability", preventiveBeforeRisk: "preventiveBeforeRisk",
    preventiveAfterSeverity: "preventiveAfterSeverity", preventiveAfterProbability: "preventiveAfterProbability", preventiveAfterRisk: "preventiveAfterRisk",
    mitigatingBeforeSeverity: "mitigatingBeforeSeverity", mitigatingBeforeProbability: "mitigatingBeforeProbability", mitigatingBeforeRisk: "mitigatingBeforeRisk",
    mitigatingAfterSeverity: "mitigatingAfterSeverity", mitigatingAfterProbability: "mitigatingAfterProbability", mitigatingAfterRisk: "mitigatingAfterRisk",
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
    if (value === "additional" || value === "target" || value === "proposed" || value === "future") return "additional";
    return undefined;
}

function riskLevel(raw: string): RiskLevel | undefined {
    const value = raw.toLowerCase().trim();
    if (value === "high") return "High";
    if (value === "serious") return "Serious";
    if (value === "medium") return "Medium";
    if (value === "low") return "Low";
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
    if (!columns.hazardId) return empty;

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

    const ensureNode = (set: ControlSet | undefined, kind: DataKind, semanticId: string, name: string, tooltip: string,
        hierarchy: string, verificationMethods: string, verificationPhases: string,
        identityColumn: DataViewCategoryColumn, row: number): ExplicitNode => {
        const id = (kind === "hazard" ? "shared" : (set || "initial")) + "|" + kind + "|" + semanticId;
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

    const ensureRisk = (set: ControlSet, controlKind: "preventive" | "mitigating", pathKey: string,
        position: "before" | "intermediate" | "after", severity: string, probability: string, assessedRisk: string,
        flowRank: number, resultantRisk: boolean, row: number): ExplicitNode => {
        const semanticId = controlKind + "|" + pathKey + "|" + position;
        const id = "risk|" + semanticId;
        const existing = nodeMap.get(id);
        if (existing) {
            existing.highlighted = existing.highlighted || highlighted(row);
            if ((!existing.severity && severity) || (!existing.probability && probability)) {
                existing.severity = existing.severity || severity;
                existing.probability = existing.probability || probability;
            }
            if (!existing.riskLevel) existing.riskLevel = riskLevel(assessedRisk);
            existing.resultantRisk = existing.resultantRisk || resultantRisk;
            return existing;
        }
        const node: ExplicitNode = {
            id, semanticId, label: "Not assessed", type: "Risk", typeKey: "other", nodeKind: "risk",
            controlSet: resultantRisk ? set : undefined, tooltip: "", hierarchy: "", verificationMethods: [], verificationPhases: [], selectable: false, highlighted: highlighted(row),
            program: "", classification: "", caveat: "", status: "", shortName: position === "before" ? "Before control" : "After control",
            longName: "", scope: "", version: "", externalId: "", dmsId: "", severity, probability,
            riskLevel: riskLevel(assessedRisk),
            flowRank, pathKey, riskStage: position, resultantRisk,
            bowtieRole: (position === "before" ? "Risk before " : "Risk after ") + controlKind + " control"
        };
        nodeMap.set(id, node);
        return node;
    };

    const addLink = (source: ExplicitNode, target: ExplicitNode, type: string, row: number,
        linkSet?: ControlSet, bypass: boolean = false) => {
        const key = source.id + "|" + target.id + "|" + type;
        if (linkKeys.has(key)) return;
        linkKeys.add(key);
        links.push({ id: "e" + links.length, source: source.id, target: target.id, linkType: type,
            linkKey: normaliseLinkKey(type), highlighted: highlighted(row), controlSet: linkSet, bypass });
    };

    type RowRecord = {
        row: number; set: ControlSet; hazardId: string; hazard: ExplicitNode;
        causeId: string; effectId: string; preventiveId: string; mitigatingId: string;
    };
    const rowRecords: RowRecord[] = [];
    for (let row = 0; row < columns.hazardId.values.length; row++) {
        const hazardId = text(columns.hazardId, row);
        if (!hazardId) continue;
        hazardIds.add(hazardId);
        const rawSet = columns.controlSet ? controlSet(text(columns.controlSet, row)) : "initial";
        if (columns.controlSet && !rawSet) { issues.add("Rows with an unknown Control Set were ignored."); continue; }
        const set: ControlSet = rawSet ?? "initial";
        controlSets.add(set);
        const hazard = ensureNode(undefined, "hazard", hazardId, text(columns.hazardName, row), text(columns.hazardTooltip, row), "", "", "", columns.hazardId, row);
        hazard.flowRank = 0;
        rowRecords.push({
            row, set, hazard, hazardId,
            causeId: text(columns.causeId, row),
            effectId: text(columns.effectId, row),
            preventiveId: text(columns.preventiveControlId, row),
            mitigatingId: text(columns.mitigatingControlId, row)
        });
    }

    const valueFromRows = (records: RowRecord[], column: keyof typeof ROLE): string => {
        for (const record of records) {
            const value = text(columns[column], record.row);
            if (value) return value;
        }
        return "";
    };
    const buildPreventivePath = (records: RowRecord[], causeId: string, hazard: ExplicitNode): void => {
        const initial = records.find(record => record.set === "initial");
        const additional = records.find(record => record.set === "additional");
        const controlRecord = initial || additional;
        if (!controlRecord) return;
        const pathKey = "preventive|" + causeId + "|" + controlRecord.hazardId;
        const cause = ensureNode(undefined, "cause", causeId, text(columns.causeName, controlRecord.row), text(columns.causeTooltip, controlRecord.row), "", "", "", columns.causeId as DataViewCategoryColumn, controlRecord.row);
        cause.flowRank = -6;
        cause.pathKey = pathKey;
        const beforeRow = initial || additional as RowRecord;
        const before = ensureRisk("initial", "preventive", pathKey, "before",
            valueFromRows(initial ? [initial] : [additional as RowRecord], "preventiveBeforeSeverity"),
            valueFromRows(initial ? [initial] : [additional as RowRecord], "preventiveBeforeProbability"),
            valueFromRows(initial ? [initial] : [additional as RowRecord], "preventiveBeforeRisk"), -5, false, beforeRow.row);
        addLink(cause, before, "exposes", beforeRow.row);
        if (initial) {
            const initialControl = ensureNode("initial", "preventiveControl", text(columns.preventiveControlId, initial.row), text(columns.preventiveControlName, initial.row), text(columns.preventiveControlTooltip, initial.row), text(columns.preventiveControlHierarchy, initial.row), text(columns.preventiveVerificationMethod, initial.row), text(columns.preventiveVerificationPhase, initial.row), columns.preventiveControlId as DataViewCategoryColumn, initial.row);
            initialControl.flowRank = -4;
            initialControl.pathKey = pathKey;
            addLink(before, initialControl, "treated by", initial.row, "initial");
            const intermediate = ensureRisk("initial", "preventive", pathKey, "intermediate",
                valueFromRows([initial, additional as RowRecord].filter(Boolean), "preventiveAfterSeverity"),
                valueFromRows([initial, additional as RowRecord].filter(Boolean), "preventiveAfterProbability"),
                valueFromRows([initial, additional as RowRecord].filter(Boolean), "preventiveAfterRisk"), -3, !additional, initial.row);
            addLink(initialControl, intermediate, "reduces to", initial.row, "initial");
            if (additional) {
                addLink(intermediate, hazard, "bypasses", additional.row, "initial", true);
                const additionalControl = ensureNode("additional", "preventiveControl", text(columns.preventiveControlId, additional.row), text(columns.preventiveControlName, additional.row), text(columns.preventiveControlTooltip, additional.row), text(columns.preventiveControlHierarchy, additional.row), text(columns.preventiveVerificationMethod, additional.row), text(columns.preventiveVerificationPhase, additional.row), columns.preventiveControlId as DataViewCategoryColumn, additional.row);
                additionalControl.flowRank = -2;
                additionalControl.pathKey = pathKey;
                addLink(intermediate, additionalControl, "treated by", additional.row, "additional");
                const finalRisk = ensureRisk("additional", "preventive", pathKey, "after", text(columns.preventiveAfterSeverity, additional.row), text(columns.preventiveAfterProbability, additional.row), text(columns.preventiveAfterRisk, additional.row), -1, true, additional.row);
                addLink(additionalControl, finalRisk, "reduces to", additional.row, "additional");
                addLink(finalRisk, hazard, "prevents", additional.row, "additional");
            } else {
                addLink(intermediate, hazard, "prevents", initial.row, "initial");
            }
        } else if (additional) {
            const additionalControl = ensureNode("additional", "preventiveControl", text(columns.preventiveControlId, additional.row), text(columns.preventiveControlName, additional.row), text(columns.preventiveControlTooltip, additional.row), text(columns.preventiveControlHierarchy, additional.row), text(columns.preventiveVerificationMethod, additional.row), text(columns.preventiveVerificationPhase, additional.row), columns.preventiveControlId as DataViewCategoryColumn, additional.row);
            additionalControl.flowRank = -2;
            additionalControl.pathKey = pathKey;
            addLink(before, additionalControl, "treated by", additional.row, "additional");
            const finalRisk = ensureRisk("additional", "preventive", pathKey, "after", text(columns.preventiveAfterSeverity, additional.row), text(columns.preventiveAfterProbability, additional.row), text(columns.preventiveAfterRisk, additional.row), -1, true, additional.row);
            addLink(additionalControl, finalRisk, "reduces to", additional.row, "additional");
            addLink(finalRisk, hazard, "prevents", additional.row, "additional");
        }
    };
    const buildMitigatingPath = (records: RowRecord[], effectId: string, hazard: ExplicitNode): void => {
        const initial = records.find(record => record.set === "initial");
        const additional = records.find(record => record.set === "additional");
        const controlRecord = initial || additional;
        if (!controlRecord) return;
        const pathKey = "mitigating|" + controlRecord.hazardId + "|" + effectId;
        const effect = ensureNode(undefined, "effect", effectId, text(columns.effectName, controlRecord.row), text(columns.effectTooltip, controlRecord.row), "", "", "", columns.effectId as DataViewCategoryColumn, controlRecord.row);
        effect.flowRank = 6;
        effect.pathKey = pathKey;
        const beforeRow = initial || additional as RowRecord;
        const before = ensureRisk("initial", "mitigating", pathKey, "before", valueFromRows(initial ? [initial] : [additional as RowRecord], "mitigatingBeforeSeverity"), valueFromRows(initial ? [initial] : [additional as RowRecord], "mitigatingBeforeProbability"), valueFromRows(initial ? [initial] : [additional as RowRecord], "mitigatingBeforeRisk"), 1, false, beforeRow.row);
        addLink(hazard, before, "exposes", beforeRow.row);
        if (initial) {
            const initialControl = ensureNode("initial", "mitigatingControl", text(columns.mitigatingControlId, initial.row), text(columns.mitigatingControlName, initial.row), text(columns.mitigatingControlTooltip, initial.row), text(columns.mitigatingControlHierarchy, initial.row), text(columns.mitigatingVerificationMethod, initial.row), text(columns.mitigatingVerificationPhase, initial.row), columns.mitigatingControlId as DataViewCategoryColumn, initial.row);
            initialControl.flowRank = 2;
            initialControl.pathKey = pathKey;
            addLink(before, initialControl, "treated by", initial.row, "initial");
            const intermediate = ensureRisk("initial", "mitigating", pathKey, "intermediate", valueFromRows([initial, additional as RowRecord].filter(Boolean), "mitigatingAfterSeverity"), valueFromRows([initial, additional as RowRecord].filter(Boolean), "mitigatingAfterProbability"), valueFromRows([initial, additional as RowRecord].filter(Boolean), "mitigatingAfterRisk"), 3, !additional, initial.row);
            addLink(initialControl, intermediate, "reduces to", initial.row, "initial");
            if (additional) {
                addLink(intermediate, effect, "bypasses", additional.row, "initial", true);
                const additionalControl = ensureNode("additional", "mitigatingControl", text(columns.mitigatingControlId, additional.row), text(columns.mitigatingControlName, additional.row), text(columns.mitigatingControlTooltip, additional.row), text(columns.mitigatingControlHierarchy, additional.row), text(columns.mitigatingVerificationMethod, additional.row), text(columns.mitigatingVerificationPhase, additional.row), columns.mitigatingControlId as DataViewCategoryColumn, additional.row);
                additionalControl.flowRank = 4;
                additionalControl.pathKey = pathKey;
                addLink(intermediate, additionalControl, "treated by", additional.row, "additional");
                const finalRisk = ensureRisk("additional", "mitigating", pathKey, "after", text(columns.mitigatingAfterSeverity, additional.row), text(columns.mitigatingAfterProbability, additional.row), text(columns.mitigatingAfterRisk, additional.row), 5, true, additional.row);
                addLink(additionalControl, finalRisk, "reduces to", additional.row, "additional");
                addLink(finalRisk, effect, "mitigates", additional.row, "additional");
            } else {
                addLink(intermediate, effect, "mitigates", initial.row, "initial");
            }
        } else if (additional) {
            const additionalControl = ensureNode("additional", "mitigatingControl", text(columns.mitigatingControlId, additional.row), text(columns.mitigatingControlName, additional.row), text(columns.mitigatingControlTooltip, additional.row), text(columns.mitigatingControlHierarchy, additional.row), text(columns.mitigatingVerificationMethod, additional.row), text(columns.mitigatingVerificationPhase, additional.row), columns.mitigatingControlId as DataViewCategoryColumn, additional.row);
            additionalControl.flowRank = 4;
            additionalControl.pathKey = pathKey;
            addLink(before, additionalControl, "treated by", additional.row, "additional");
            const finalRisk = ensureRisk("additional", "mitigating", pathKey, "after", text(columns.mitigatingAfterSeverity, additional.row), text(columns.mitigatingAfterProbability, additional.row), text(columns.mitigatingAfterRisk, additional.row), 5, true, additional.row);
            addLink(additionalControl, finalRisk, "reduces to", additional.row, "additional");
            addLink(finalRisk, effect, "mitigates", additional.row, "additional");
        }
    };

    const preventiveGroups = new Map<string, RowRecord[]>();
    const mitigatingGroups = new Map<string, RowRecord[]>();
    for (const record of rowRecords) {
        if (record.causeId && record.preventiveId) {
            const key = record.hazardId + "|" + record.causeId;
            const group = preventiveGroups.get(key) || [];
            group.push(record);
            preventiveGroups.set(key, group);
        } else if (record.causeId || record.preventiveId) {
            issues.add("Incomplete preventive-control rows were ignored.");
        }
        if (record.mitigatingId && record.effectId) {
            const key = record.hazardId + "|" + record.effectId;
            const group = mitigatingGroups.get(key) || [];
            group.push(record);
            mitigatingGroups.set(key, group);
        } else if (record.mitigatingId || record.effectId) {
            issues.add("Incomplete mitigating-control rows were ignored.");
        }
    }
    for (const records of preventiveGroups.values()) buildPreventivePath(records, records[0].causeId, records[0].hazard);
    for (const records of mitigatingGroups.values()) buildMitigatingPath(records, records[0].effectId, records[0].hazard);

    return {
        nodes: Array.from(nodeMap.values()), links,
        types: ["Cause", "Preventive Control", "Hazard", "Mitigating Control", "Effect"], programs: [],
        hasActiveHighlight: !!highlights, hazardIds: Array.from(hazardIds).sort(),
        controlSets: Array.from(controlSets).sort(), issues: Array.from(issues)
    };
}