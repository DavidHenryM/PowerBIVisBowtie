/*
 * Icon and colour helpers: normalisation of artefact types / link types,
 * PSPF-style classification colours, and memoised per-node SVG data-URI
 * generation (type glyph badge + classification / caveat chips).
 * Everything is generated locally — no external assets or web fonts.
 */

"use strict";

/** Canonical artefact type keys */
export type ArtefactTypeKey = "document" | "spec" | "causalFactor" | "hazard" | "control" | "mishap" | "verification" | "requirement" | "other";

/** Canonical link type keys */
export type LinkTypeKey = "derives" | "causes" | "mitigates" | "resultsIn" | "verifies" | "allocates" | "informs" | "other";

export interface StatusStyle {
    line: "solid" | "dashed" | "dotted";
    color: string;
}

const TYPE_GLYPHS: Record<ArtefactTypeKey, string> = {
    document: "D",
    spec: "S",
    causalFactor: "F",
    hazard: "!",
    control: "C",
    mishap: "M",
    verification: "V",
    requirement: "R",
    other: "?"
};

/** Maps a raw artefact type string (e.g. "Hazard", "Causal Factor", "Mishap") to a canonical key. */
export function normaliseTypeKey(raw: string): ArtefactTypeKey {
    const v = (raw || "").toLowerCase();
    if (!v) {
        return "other";
    }
    // bowtie roles first — MIL-STD-882E terms win over generic SE terms
    if (v.includes("mishap") || v.includes("consequence") || v.includes("loss event") || v.includes("accident")) {
        return "mishap";
    }
    if (v.includes("causal") || v.includes("threat") || v.includes("cause")) {
        return "causalFactor";
    }
    if (v.includes("hazard") || v.includes("risk")) {
        return "hazard";
    }
    if (v.includes("control") || v.includes("mitigation") || v.includes("barrier")) {
        return "control";
    }
    if (v.includes("verif") || v.includes("test") || v.includes("vcr") || v.includes("validation")) {
        return "verification";
    }
    if (v.includes("req")) {
        return "requirement";
    }
    if (v.includes("spec")) {
        return "spec";
    }
    if (v.includes("semp") || v.includes("ocd") || v.includes("ssmp") || v.includes("plan")
        || v.includes("doc") || v.includes("conops") || v.includes("srs")) {
        return "document";
    }
    return "other";
}

/** Maps a raw link type string (e.g. "causes", "results-in") to a canonical key used for edge colouring. */
export function normaliseLinkKey(raw: string): LinkTypeKey {
    const v = (raw || "").toLowerCase();
    if (!v) {
        return "other";
    }
    if (v.includes("deriv") || v.includes("decompos") || v.includes("satisf")) {
        return "derives";
    }
    if (v.includes("caus") || v.includes("threaten") || v.includes("contribut") || v.includes("leads to")) {
        return "causes";
    }
    if (v.includes("result") || v.includes("consequenc") || v.includes("outcome")) {
        return "resultsIn";
    }
    if (v.includes("mitigat") || v.includes("treat") || v.includes("reduc")) {
        return "mitigates";
    }
    if (v.includes("verif") || v.includes("test") || v.includes("validat")) {
        return "verifies";
    }
    if (v.includes("allocat") || v.includes("assign")) {
        return "allocates";
    }
    if (v.includes("inform") || v.includes("ref") || v.includes("support")) {
        return "informs";
    }
    return "other";
}

/** PSPF-style classification chip colours (config-friendly: match on substring). */
export function classificationColor(raw: string): string {
    const v = (raw || "").toLowerCase();
    if (!v) {
        return "#9E9E9E";
    }
    if (v.includes("top secret")) {
        return "#4A148C";
    }
    if (v.includes("secret")) {
        return "#C62828";
    }
    if (v.includes("protected")) {
        return "#EF6C00";
    }
    if (v.includes("sensitive")) {
        return "#F9A825";
    }
    if (v.includes("official")) {
        return "#2E7D32";
    }
    if (v.includes("unclass") || v.includes("unofficial")) {
        return "#9E9E9E";
    }
    return "#607D8B";
}

/** Caveat chip colours. */
export function caveatColor(raw: string): string {
    const v = (raw || "").toLowerCase();
    if (!v) {
        return "#607D8B";
    }
    if (v.includes("austeo") || v.includes("australian eyes")) {
        return "#1565C0";
    }
    if (v.includes("fvey") || v.includes("five eyes")) {
        return "#6A1B9A";
    }
    if (v.includes("export control") || v.includes("itar") || v.includes("ear99") || v.includes("dtc")) {
        return "#C62828";
    }
    if (v.includes("rel") || v.includes("releasable")) {
        return "#00838F";
    }
    return "#607D8B";
}

/** Lifecycle status → border style. */
export function statusStyle(raw: string): StatusStyle {
    const v = (raw || "").toLowerCase();
    if (v.includes("draft") || v.includes("wip") || v.includes("progress")) {
        return { line: "dashed", color: "#757575" };
    }
    if (v.includes("approv")) {
        return { line: "solid", color: "#2E7D32" };
    }
    if (v.includes("baseline") || v.includes("release")) {
        return { line: "solid", color: "#1565C0" };
    }
    if (v.includes("supersed") || v.includes("retire") || v.includes("obsolete")) {
        return { line: "dotted", color: "#C62828" };
    }
    return { line: "solid", color: "#424242" };
}

export interface NodeIconOptions {
    width: number;
    height: number;
    typeKey: ArtefactTypeKey;
    classification: string;
    caveat: string;
    showIcons: boolean;
    showClassification: boolean;
    showCaveat: boolean;
    /** assessed 882E risk level ("High"/"Serious"/"Medium"/"Low") for the H/S/M/L badge */
    riskLevel: string;
    /** colour for the risk badge, resolved from the Colors card */
    riskColor: string;
    showRiskBadge: boolean;
}

const iconCache = new Map<string, string>();

function chipSvg(text: string, fill: string, x: number, y: number): string {
    const fontSize = 9;
    const chipW = Math.ceil(text.length * fontSize * 0.62) + 8;
    const chipH = 13;
    const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return "<rect x=\"" + x + "\" y=\"" + y + "\" width=\"" + chipW + "\" height=\"" + chipH + "\" rx=\"3\" fill=\"" + fill + "\"/>"
        + "<text x=\"" + (x + chipW / 2) + "\" y=\"" + (y + chipH / 2) + "\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"" + fontSize
        + "\" font-weight=\"bold\" fill=\"#ffffff\" text-anchor=\"middle\" dominant-baseline=\"central\">" + safeText + "</text>";
}

/**
 * Returns an SVG data-URI drawn over the node body: a type glyph badge on the
 * left and classification / caveat chips at the top-right. Memoised — identical
 * option sets share one generated image.
 */
export function getNodeIcon(options: NodeIconOptions): string {
    const cacheKey = JSON.stringify(options);
    const cached = iconCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const w = Math.max(40, Math.round(options.width));
    const h = Math.max(24, Math.round(options.height));
    const parts: string[] = [];

    if (options.showIcons) {
        const badgeR = h / 2 - 6;
        const cx = badgeR + 5;
        const cy = h / 2;
        const glyph = TYPE_GLYPHS[options.typeKey] || TYPE_GLYPHS.other;
        parts.push("<circle cx=\"" + cx + "\" cy=\"" + cy + "\" r=\"" + badgeR + "\" fill=\"rgba(255,255,255,0.22)\" stroke=\"#ffffff\" stroke-width=\"1.5\"/>");
        parts.push("<text x=\"" + cx + "\" y=\"" + cy + "\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"" + badgeR
            + "\" font-weight=\"bold\" fill=\"#ffffff\" text-anchor=\"middle\" dominant-baseline=\"central\">" + glyph + "</text>");
    }

    const chipGap = 3;
    let chipY = chipGap;
    const chipX = (text: string) => w - (Math.ceil(text.length * 9 * 0.62) + 8) - chipGap;
    if (options.showClassification && options.classification) {
        parts.push(chipSvg(options.classification, classificationColor(options.classification), chipX(options.classification), chipY));
        chipY += 13 + chipGap;
    }
    if (options.showCaveat && options.caveat) {
        parts.push(chipSvg(options.caveat, caveatColor(options.caveat), chipX(options.caveat), chipY));
    }

    // 882E mishap risk badge (H/S/M/L) at the bottom-right corner
    if (options.showRiskBadge && options.riskLevel && options.riskColor) {
        const letter = options.riskLevel.charAt(0).toUpperCase();
        const badgeW = 16;
        const badgeH = 13;
        const bx = w - badgeW - chipGap;
        const by = h - badgeH - chipGap;
        parts.push("<rect x=\"" + bx + "\" y=\"" + by + "\" width=\"" + badgeW + "\" height=\"" + badgeH + "\" rx=\"3\" fill=\"" + options.riskColor + "\" stroke=\"#ffffff\" stroke-width=\"1\"/>");
        parts.push("<text x=\"" + (bx + badgeW / 2) + "\" y=\"" + (by + badgeH / 2) + "\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"9\" font-weight=\"bold\" fill=\"#ffffff\" text-anchor=\"middle\" dominant-baseline=\"central\">" + letter + "</text>");
    }

    let uri = "none";
    if (parts.length > 0) {
        const svg = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE svg>"
            + "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + w + "\" height=\"" + h + "\" viewBox=\"0 0 " + w + " " + h + "\">"
            + parts.join("")
            + "</svg>";
        uri = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    }

    iconCache.set(cacheKey, uri);
    return uri;
}
