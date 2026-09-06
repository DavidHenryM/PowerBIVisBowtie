/*
 * Formatting settings model for the Artefact Relation visual.
 * Property names must match the objects declared in capabilities.json.
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * Equivalent to powerbi-visuals-utils-dataviewutils' dataViewWildcard.createDataViewWildcardSelector(0),
 * inlined here because webpack's ESM export mangling strips the literal function name from the production
 * bundle, which breaks pbiviz's Conditional Formatting feature detection (a plain string search).
 */
function wildcardSelector(): powerbi.data.Selector {
    return { data: [{ dataViewWildcard: { matchingOption: 0 } }] } as unknown as powerbi.data.Selector;
}

/**
 * Layout card — bowtie spacing and transition options. The bowtie column
 * layout is fixed; these settings only control spacing and animation.
 */
class LayoutCardSettings extends FormattingSettingsCard {
    idealEdgeLength = new formattingSettings.NumUpDown({
        name: "idealEdgeLength",
        displayName: "Column spacing",
        value: 120
    });

    animate = new formattingSettings.ToggleSwitch({
        name: "animate",
        displayName: "Animate layout",
        value: true
    });

    fitOnLoad = new formattingSettings.ToggleSwitch({
        name: "fitOnLoad",
        displayName: "Fit to view on load",
        value: true
    });

    name: string = "layout";
    displayName: string = "Layout";
    slices: Array<FormattingSettingsSlice> = [this.idealEdgeLength, this.animate, this.fitOnLoad];
}

/**
 * Bowtie card — bowtie-specific presentation options.
 */
class BowtieCardSettings extends FormattingSettingsCard {
    showColumnHeaders = new formattingSettings.ToggleSwitch({
        name: "showColumnHeaders",
        displayName: "Show column headers",
        value: true
    });

    laneSpacing = new formattingSettings.NumUpDown({
        name: "laneSpacing",
        displayName: "Row spacing",
        value: 110
    });

    name: string = "bowtie";
    displayName: string = "Bowtie";
    slices: Array<FormattingSettingsSlice> = [this.showColumnHeaders, this.laneSpacing];
}

/**
 * Risk card — MIL-STD-882E mishap risk presentation options.
 */
class RiskCardSettings extends FormattingSettingsCard {
    riskColoring = new formattingSettings.ToggleSwitch({
        name: "riskColoring",
        displayName: "Colour nodes by assessed risk",
        value: true
    });

    showRiskBadge = new formattingSettings.ToggleSwitch({
        name: "showRiskBadge",
        displayName: "Show risk badge (H/S/M/L)",
        value: true
    });

    name: string = "risk";
    displayName: string = "Mishap risk (MIL-STD-882E)";
    slices: Array<FormattingSettingsSlice> = [this.riskColoring, this.showRiskBadge];
}

/**
 * Nodes card — node size, label and icon options.
 */
class NodesCardSettings extends FormattingSettingsCard {
    nodeWidth = new formattingSettings.NumUpDown({
        name: "nodeWidth",
        displayName: "Node width",
        value: 150
    });

    nodeHeight = new formattingSettings.NumUpDown({
        name: "nodeHeight",
        displayName: "Node height",
        value: 56
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Label font size",
        value: 11
    });

    showIcons = new formattingSettings.ToggleSwitch({
        name: "showIcons",
        displayName: "Show type icons",
        value: true
    });

    showClassification = new formattingSettings.ToggleSwitch({
        name: "showClassification",
        displayName: "Show classification chips",
        value: true
    });

    showCaveat = new formattingSettings.ToggleSwitch({
        name: "showCaveat",
        displayName: "Show caveat chips",
        value: true
    });

    statusBorders = new formattingSettings.ToggleSwitch({
        name: "statusBorders",
        displayName: "Status border styles",
        value: true
    });

    minZoomedFontSize = new formattingSettings.NumUpDown({
        name: "minZoomedFontSize",
        displayName: "Hide labels below font size",
        value: 6
    });

    name: string = "nodes";
    displayName: string = "Nodes";
    slices: Array<FormattingSettingsSlice> = [
        this.nodeWidth, this.nodeHeight, this.fontSize, this.showIcons,
        this.showClassification, this.showCaveat, this.statusBorders, this.minZoomedFontSize
    ];
}

/**
 * Links card — edge style options.
 */
class LinksCardSettings extends FormattingSettingsCard {
    showEdgeLabels = new formattingSettings.ToggleSwitch({
        name: "showEdgeLabels",
        displayName: "Show link labels",
        value: true
    });

    edgeLabelFontSize = new formattingSettings.NumUpDown({
        name: "edgeLabelFontSize",
        displayName: "Link label font size",
        value: 9
    });

    arrowScale = new formattingSettings.NumUpDown({
        name: "arrowScale",
        displayName: "Arrow size",
        value: 1.2
    });

    curved = new formattingSettings.ToggleSwitch({
        name: "curved",
        displayName: "Curved links",
        value: true
    });

    name: string = "links";
    displayName: string = "Links";
    slices: Array<FormattingSettingsSlice> = [this.showEdgeLabels, this.edgeLabelFontSize, this.arrowScale, this.curved];
}

/**
 * Legend card — in-visual filter legend.
 */
class LegendCardSettings extends FormattingSettingsCard {
    showLegend = new formattingSettings.ToggleSwitch({
        name: "showLegend",
        displayName: "Show legend / filters",
        value: true
    });

    name: string = "legend";
    displayName: string = "Legend";
    slices: Array<FormattingSettingsSlice> = [this.showLegend];
}

/**
 * Colors card — artefact-type node colours and link-type edge colours.
 */
class ColorsCardSettings extends FormattingSettingsCard {
    documentColor = new formattingSettings.ColorPicker({
        name: "documentColor", displayName: "Document (SEMP/OCD/VCRM/SSMP)", value: { value: "#4472C4" }
    });
    specColor = new formattingSettings.ColorPicker({
        name: "specColor", displayName: "Specification", value: { value: "#70AD47" }
    });
    causalFactorColor = new formattingSettings.ColorPicker({
        name: "causalFactorColor", displayName: "Causal factor", value: { value: "#8D6E63" }
    });
    hazardColor = new formattingSettings.ColorPicker({
        name: "hazardColor", displayName: "Hazard (top event)", value: { value: "#ED7D31" }
    });
    controlColor = new formattingSettings.ColorPicker({
        name: "controlColor", displayName: "Safety control", value: { value: "#FFC000" }
    });
    mishapColor = new formattingSettings.ColorPicker({
        name: "mishapColor", displayName: "Mishap", value: { value: "#C62828" }
    });
    verificationColor = new formattingSettings.ColorPicker({
        name: "verificationColor", displayName: "Verification", value: { value: "#7030A0" }
    });
    requirementColor = new formattingSettings.ColorPicker({
        name: "requirementColor", displayName: "Requirement", value: { value: "#00B0F0" }
    });
    otherNodeColor = new formattingSettings.ColorPicker({
        name: "otherNodeColor", displayName: "Other artefact", value: { value: "#8C8C8C" }
    });
    derivesColor = new formattingSettings.ColorPicker({
        name: "derivesColor", displayName: "Link: derives", value: { value: "#5B8FF9" }
    });
    causesColor = new formattingSettings.ColorPicker({
        name: "causesColor", displayName: "Link: causes", value: { value: "#A1887F" }
    });
    mitigatesColor = new formattingSettings.ColorPicker({
        name: "mitigatesColor", displayName: "Link: mitigates", value: { value: "#F6BD16" }
    });
    resultsInColor = new formattingSettings.ColorPicker({
        name: "resultsInColor", displayName: "Link: results in", value: { value: "#E57373" }
    });
    verifiesColor = new formattingSettings.ColorPicker({
        name: "verifiesColor", displayName: "Link: verifies", value: { value: "#5AD8A6" }
    });
    allocatesColor = new formattingSettings.ColorPicker({
        name: "allocatesColor", displayName: "Link: allocates", value: { value: "#945FB9" }
    });
    informsColor = new formattingSettings.ColorPicker({
        name: "informsColor", displayName: "Link: informs", value: { value: "#65789B" }
    });
    otherLinkColor = new formattingSettings.ColorPicker({
        name: "otherLinkColor", displayName: "Link: other", value: { value: "#999999" }
    });
    riskHighColor = new formattingSettings.ColorPicker({
        name: "riskHighColor", displayName: "Risk: High", value: { value: "#C62828" }
    });
    riskSeriousColor = new formattingSettings.ColorPicker({
        name: "riskSeriousColor", displayName: "Risk: Serious", value: { value: "#EF6C00" }
    });
    riskMediumColor = new formattingSettings.ColorPicker({
        name: "riskMediumColor", displayName: "Risk: Medium", value: { value: "#F9A825" }
    });
    riskLowColor = new formattingSettings.ColorPicker({
        name: "riskLowColor", displayName: "Risk: Low", value: { value: "#2E7D32" }
    });

    name: string = "colors";
    displayName: string = "Colors";
    slices: Array<FormattingSettingsSlice> = [
        this.documentColor, this.specColor, this.causalFactorColor, this.hazardColor, this.controlColor,
        this.mishapColor, this.verificationColor, this.requirementColor, this.otherNodeColor,
        this.derivesColor, this.causesColor, this.mitigatesColor, this.resultsInColor,
        this.verifiesColor, this.allocatesColor, this.informsColor, this.otherLinkColor,
        this.riskHighColor, this.riskSeriousColor, this.riskMediumColor, this.riskLowColor
    ];
}

/**
 * Data point card — a single rule-bindable colour property. Its wildcard selector is what
 * enables Power BI's Conditional Formatting ("fx") button in the format pane; the resulting
 * per-row rule colour is read back from the DataView and overrides the type-based node colour.
 */
class DataPointCardSettings extends FormattingSettingsCard {
    /** own field assignment of the API name, kept so it can't be dead-code-eliminated like an unused reference would be */
    private readonly conditionalFormattingApi = ".createDataViewWildcardSelector";

    fill = new formattingSettings.ColorPicker({
        name: "fill",
        displayName: "Node colour override (rule-based)",
        value: { value: "" },
        selector: wildcardSelector()
    });

    name: string = "dataPoint";
    displayName: string = "Conditional formatting";
    slices: Array<FormattingSettingsSlice> = [this.fill];
}

/**
* Visual settings model class.
*/
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    layoutCard = new LayoutCardSettings();
    bowtieCard = new BowtieCardSettings();
    riskCard = new RiskCardSettings();
    nodesCard = new NodesCardSettings();
    linksCard = new LinksCardSettings();
    legendCard = new LegendCardSettings();
    colorsCard = new ColorsCardSettings();
    dataPointCard = new DataPointCardSettings();

    cards = [this.layoutCard, this.bowtieCard, this.riskCard, this.nodesCard, this.linksCard, this.legendCard, this.colorsCard, this.dataPointCard];
}
