/*
 * Bowtie layout: computes fixed column positions from the topology derived in
 * bowtie.ts (rank -> x, lane -> y) and lets Cytoscape's preset layout place
 * nodes at those coordinates. Node positions are cached per node id so that
 * data refreshes driven by report slicers do not reshuffle the graph, and any
 * user-dragged positions are preserved.
 */

"use strict";

import cytoscape from "cytoscape";

import { GraphModel } from "./model";

export interface BowtiePositionOptions {
    /** horizontal distance between adjacent bowtie columns */
    columnGap: number;
    /** vertical distance between lanes within a column */
    laneSpacing: number;
}

export interface PresetLayoutOptions {
    animate: boolean;
    fit: boolean;
}

/** Snapshot current node positions into the cache map. */
export function cachePositions(cy: cytoscape.Core, cache: Map<string, { x: number; y: number }>): void {
    cy.nodes().forEach(n => {
        cache.set(n.id(), { x: n.position("x"), y: n.position("y") });
    });
}

/** Re-apply cached positions to nodes that existed before. Returns true when at least one node was positioned. */
export function applyCachedPositions(cy: cytoscape.Core, cache: Map<string, { x: number; y: number }>): boolean {
    let applied = false;
    cy.nodes().forEach(n => {
        const p = cache.get(n.id());
        if (p) {
            n.position(p);
            applied = true;
        }
    });
    return applied;
}

/**
 * Computes bowtie column positions: x = rank * columnGap (causal factors -2 …
 * mishaps +2, top event at 0), y = lane * laneSpacing (top event centred on 0).
 * Nodes without a derived rank/lane are left out and keep their current position.
 */
export function computeBowtiePositions(model: GraphModel, options: BowtiePositionOptions): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of model.nodes) {
        if (node.rank === undefined || node.lane === undefined) {
            continue;
        }
        positions.set(node.id, {
            x: node.rank * options.columnGap,
            y: node.lane * options.laneSpacing
        });
    }
    return positions;
}

/** Runs the preset layout (nodes already carry positions). Returns the layout so callers can await 'layoutstop'. */
export function runBowtieLayout(cy: cytoscape.Core, options: PresetLayoutOptions): cytoscape.Layouts {
    const layout = cy.layout({
        name: "preset",
        animate: options.animate,
        fit: options.fit,
        padding: 30
    } as cytoscape.LayoutOptions);
    layout.run();
    return layout;
}
