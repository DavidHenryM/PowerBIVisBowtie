/*
 * Bowtie topology derivation and MIL-STD-882E mishap risk assessment.
 *
 * Terminology (MIL-STD-882E):
 *   - Hazard: the top event at the centre (knot) of the bowtie
 *   - Causal factor: a condition or event that can lead to the top event (left side)
 *   - Mishap: an outcome/consequence that can result from the top event (right side)
 *   - Safety control: a barrier; preventive on the causal side, mitigative on the mishap side
 *   - Severity categories I–IV (882E Table I), probability levels A–F (882E Table II),
 *     assessed mishap risk High/Serious/Medium/Low (882E Table III)
 *
 * The input model stays a flattened relationship table — sides are derived
 * purely from link direction relative to the top event (breadth-first):
 *   - nodes that can reach the top event   -> left  (causal side)
 *   - nodes reachable from the top event   -> right (mishap side)
 *   - a control takes the side of the non-hazard node it attaches to; a control
 *     attached only to the hazard is preventive when its edge points into the
 *     hazard (e.g. "mitigates") and mitigative when the edge leaves the hazard
 *     (e.g. "mitigated-by"). Nodes on a cycle resolve to the nearer side
 *     (ties break left). Unreachable nodes are reported as hidden.
 */

"use strict";

import { ArtefactNode, GraphModel, ProbabilityLevel, RiskLevel, SeverityCategory } from "./model";

export interface BowtieTopology {
    /** id of the node placed at the centre of the bowtie; undefined only for an empty graph */
    topEventId: string | undefined;
    /** ids of nodes not connected to the top event (excluded from the bowtie) */
    hiddenNodeIds: string[];
    /** true when no hazard-typed node existed and the centre was inferred by degree */
    centreInferred: boolean;
}

/** MIL-STD-882E Table III — mishap risk assessment matrix (severity row × probability column). */
const RISK_TABLE: Record<SeverityCategory, Record<ProbabilityLevel, RiskLevel>> = {
    "I": { "A": "High", "B": "High", "C": "Serious", "D": "Medium", "E": "Medium", "F": "Low" },
    "II": { "A": "High", "B": "Serious", "C": "Medium", "D": "Medium", "E": "Low", "F": "Low" },
    "III": { "A": "Serious", "B": "Medium", "C": "Medium", "D": "Low", "E": "Low", "F": "Low" },
    "IV": { "A": "Medium", "B": "Low", "C": "Low", "D": "Low", "E": "Low", "F": "Low" }
};

const SEVERITY_NAMES: Record<SeverityCategory, string> = {
    "I": "Catastrophic",
    "II": "Critical",
    "III": "Marginal",
    "IV": "Negligible"
};

const PROBABILITY_NAMES: Record<ProbabilityLevel, string> = {
    "A": "Frequent",
    "B": "Probable",
    "C": "Occasional",
    "D": "Remote",
    "E": "Improbable",
    "F": "Eliminated"
};

/** Parses a raw severity value to an 882E category. Accepts I/II/III/IV, 1–4, and category names. */
export function parseSeverity(raw: string): SeverityCategory | undefined {
    let v = (raw || "").toLowerCase().trim();
    if (!v) {
        return undefined;
    }
    v = v.replace(/^(severity|category|cat|sev|level)[\s.\-:_]*/, "").trim();
    // longest tokens first — "iii" contains "ii" contains "i"
    if (v === "iii" || v === "3" || v.indexOf("marginal") >= 0) {
        return "III";
    }
    if (v === "ii" || v === "2" || v.indexOf("critical") >= 0) {
        return "II";
    }
    if (v === "iv" || v === "4" || v.indexOf("negligible") >= 0) {
        return "IV";
    }
    if (v === "i" || v === "1" || v.indexOf("catastroph") >= 0) {
        return "I";
    }
    return undefined;
}

/** Parses a raw probability value to an 882E level. Accepts A–F and level names. */
export function parseProbability(raw: string): ProbabilityLevel | undefined {
    let v = (raw || "").toLowerCase().trim();
    if (!v) {
        return undefined;
    }
    v = v.replace(/^(probability|prob|level|likelihood)[\s.\-:_]*/, "").trim();
    // check "improbable" and "eliminated" before the shorter "probable"
    if (v === "f" || v.indexOf("eliminat") >= 0) {
        return "F";
    }
    if (v === "e" || v.indexOf("improbable") >= 0) {
        return "E";
    }
    if (v === "a" || v.indexOf("frequent") >= 0) {
        return "A";
    }
    if (v === "b" || v.indexOf("probable") >= 0) {
        return "B";
    }
    if (v === "c" || v.indexOf("occasional") >= 0) {
        return "C";
    }
    if (v === "d" || v.indexOf("remote") >= 0) {
        return "D";
    }
    return undefined;
}

/**
 * Assesses mishap risk per MIL-STD-882E Table III. Returns undefined when either
 * input is missing or unrecognised. Probability level F (Eliminated) yields "Low".
 */
export function assessRisk(severity: SeverityCategory | undefined, probability: ProbabilityLevel | undefined): RiskLevel | undefined {
    if (!severity || !probability) {
        return undefined;
    }
    return RISK_TABLE[severity][probability];
}

/** Display label for a severity category, e.g. "I – Catastrophic". */
export function describeSeverity(category: SeverityCategory): string {
    return category + " – " + SEVERITY_NAMES[category];
}

/** Display label for a probability level, e.g. "A – Frequent". */
export function describeProbability(level: ProbabilityLevel): string {
    return level + " – " + PROBABILITY_NAMES[level];
}

function breadthFirst(startId: string, neighbours: Map<string, string[]>): Map<string, number> {
    const dist = new Map<string, number>();
    const queue: string[] = [startId];
    dist.set(startId, 0);
    while (queue.length > 0) {
        const id = queue.shift() as string;
        const d = dist.get(id) as number;
        for (const next of neighbours.get(id) || []) {
            if (!dist.has(next)) {
                dist.set(next, d + 1);
                queue.push(next);
            }
        }
    }
    return dist;
}

/**
 * Derives the bowtie topology for the graph: picks the top event, assigns each
 * node a side/rank/lane, computes 882E risk where severity + probability are
 * bound, and lists nodes that fall outside the bowtie. Mutates the nodes in
 * place; call once per update before mapping to Cytoscape elements.
 */
export function deriveBowtieTopology(model: GraphModel): BowtieTopology {
    // reset derived state, then assess risk (independent of topology)
    for (const node of model.nodes) {
        node.side = undefined;
        node.rank = undefined;
        node.lane = undefined;
        node.bowtieRole = undefined;
        node.severityCategory = parseSeverity(node.severity);
        node.probabilityLevel = parseProbability(node.probability);
        node.riskLevel = assessRisk(node.severityCategory, node.probabilityLevel) || node.riskLevel;
        if (node.nodeKind === "risk") {
            node.label = node.riskLevel || "Not assessed";
        }
    }

    if (model.nodes.some(node => !!node.nodeKind)) {
        const rankByKind: Record<string, number> = {
            cause: -4,
            preventiveControl: -2,
            hazard: 0,
            mitigatingControl: 2,
            effect: 4
        };
        for (const node of model.nodes) {
            if (node.nodeKind === "risk") {
                node.rank = node.flowRank === undefined ? 0 : node.flowRank;
                node.side = node.rank < 0 ? "left" : "right";
            } else {
                node.rank = node.flowRank === undefined ? rankByKind[node.nodeKind || ""] : node.flowRank;
                node.side = node.rank === 0 ? "centre" : node.rank < 0 ? "left" : "right";
                node.bowtieRole = node.type;
            }
        }
        assignExplicitLanes(model);
        const top = model.nodes.find(node => node.nodeKind === "hazard");
        return { topEventId: top && top.id, hiddenNodeIds: [], centreInferred: false };
    }

    const out = new Map<string, string[]>();
    const into = new Map<string, string[]>();
    const pushTo = (map: Map<string, string[]>, key: string, value: string) => {
        const list = map.get(key);
        if (list) {
            list.push(value);
        } else {
            map.set(key, [value]);
        }
    };
    for (const link of model.links) {
        pushTo(out, link.source, link.target);
        pushTo(into, link.target, link.source);
    }
    const degree = (id: string) => (out.get(id) || []).length + (into.get(id) || []).length;

    // top event: the hazard-typed node (ties break by degree, then id); when no
    // hazard type is present, fall back to the highest-degree node so that
    // non-bowtie data still renders instead of failing.
    const byDegreeThenId = (a: ArtefactNode, b: ArtefactNode) => {
        const dd = degree(b.id) - degree(a.id);
        return dd !== 0 ? dd : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    };
    const hazards = model.nodes.filter(n => n.typeKey === "hazard").sort(byDegreeThenId);
    let topEvent = hazards.length > 0 ? hazards[0] : undefined;
    let centreInferred = false;
    if (!topEvent && model.nodes.length > 0) {
        topEvent = model.nodes.slice().sort(byDegreeThenId)[0];
        centreInferred = true;
    }
    if (!topEvent) {
        return { topEventId: undefined, hiddenNodeIds: model.nodes.map(n => n.id), centreInferred: false };
    }

    // sides via BFS: upstream (can reach the top event) = left, downstream = right
    const distIn = breadthFirst(topEvent.id, into);
    const distOut = breadthFirst(topEvent.id, out);
    const hiddenNodeIds: string[] = [];
    for (const node of model.nodes) {
        if (node.id === topEvent.id) {
            node.side = "centre";
            continue;
        }
        const di = distIn.get(node.id);
        const do_ = distOut.get(node.id);
        if (di === undefined && do_ === undefined) {
            hiddenNodeIds.push(node.id);
            continue;
        }
        node.side = (do_ === undefined || (di !== undefined && di <= do_)) ? "left" : "right";
    }

    // rank (layout column) and role label from side + control-ness
    for (const node of model.nodes) {
        if (!node.side) {
            continue;
        }
        const isControl = node.typeKey === "control";
        if (node.side === "centre") {
            node.rank = 0;
            node.lane = 0;
            node.bowtieRole = node.typeKey === "hazard" ? "Top event (Hazard)" : "Top event";
        } else if (node.side === "left") {
            node.rank = isControl ? -1 : -2;
            node.bowtieRole = isControl ? "Preventive control" : "Causal factor";
        } else {
            node.rank = isControl ? 1 : 2;
            node.bowtieRole = isControl ? "Mitigative control" : "Mishap";
        }
    }

    assignLanes(model, into, out);

    return { topEventId: topEvent.id, hiddenNodeIds: hiddenNodeIds, centreInferred: centreInferred };
}

function assignExplicitLanes(model: GraphModel): void {
    const rankGroups = new Map<number, ArtefactNode[]>();
    for (const node of model.nodes) {
        if (node.rank === undefined) {
            continue;
        }
        const list = rankGroups.get(node.rank) || [];
        list.push(node);
        rankGroups.set(node.rank, list);
    }

    for (const [rank, nodes] of rankGroups.entries()) {
        const ordered = nodes.slice().sort((a, b) => {
            const pathA = a.pathKey || a.id;
            const pathB = b.pathKey || b.id;
            return pathA < pathB ? -1 : pathA > pathB ? 1 : 0;
        });
        ordered.forEach((node, index) => {
            node.lane = rank === 0 ? 0 : index - (ordered.length - 1) / 2;
        });
    }
}

/**
 * Assigns a lane (stack position) within each column. Causal factors and
 * mishaps stack in id order; controls inherit the average lane of the
 * same-side threat/mishap line nodes they attach to, so a barrier sits on
 * the line it protects. Every column is centred on lane 0 (the top event).
 */
function assignLanes(model: GraphModel, into: Map<string, string[]>, out: Map<string, string[]>): void {
    const visible = model.nodes.filter(n => n.side !== undefined);
    const byRank = new Map<number, ArtefactNode[]>();
    for (const node of visible) {
        const rank = node.rank as number;
        const list = byRank.get(rank);
        if (list) {
            list.push(node);
        } else {
            byRank.set(rank, [node]);
        }
    }

    const laneById = new Map<string, number>();

    // outer columns first: causal factors and mishaps in stable id order
    for (const rank of [-2, 2]) {
        const column = (byRank.get(rank) || []).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        column.forEach((node, i) => laneById.set(node.id, i));
    }

    // control columns: prefer the average lane of attached same-side line nodes
    for (const rank of [-1, 1]) {
        const column = (byRank.get(rank) || []).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        for (const node of column) {
            const neighbourLanes: number[] = [];
            const neighbours = (into.get(node.id) || []).concat(out.get(node.id) || []);
            for (const otherId of neighbours) {
                const lane = laneById.get(otherId);
                if (lane !== undefined) {
                    neighbourLanes.push(lane);
                }
            }
            const preferred = neighbourLanes.length > 0
                ? neighbourLanes.reduce((sum, l) => sum + l, 0) / neighbourLanes.length
                : 0;
            laneById.set(node.id, preferred);
        }
    }

    // final pass: order each column by preferred lane and centre the stack on lane 0
    byRank.forEach((column, rank) => {
        if (rank === 0) {
            return; // top event stays at lane 0
        }
        const ordered = column.slice().sort((a, b) => {
            const la = laneById.get(a.id) as number;
            const lb = laneById.get(b.id) as number;
            return la !== lb ? la - lb : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        });
        ordered.forEach((node, i) => {
            node.lane = i - (ordered.length - 1) / 2;
        });
    });
    const top = byRank.get(0);
    if (top && top.length > 0) {
        top[0].lane = 0;
    }
}
