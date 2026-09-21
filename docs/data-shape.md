# Data shape for the Safety Bowtie visual

The visual consumes one flat table and displays one hazard at a time. Use a Power BI slicer or page filter on `Hazard ID` or `Hazard Name`. When exactly one hazard remains, the visual displays two vertically stacked bowties: **Initial controls** and **Target controls**.

## Field wells

| Field | Required | Purpose |
|---|---:|---|
| Control Set | yes | `Initial` or `Target` |
| Cause ID / Name | for preventive paths | Stable cause key and display label |
| Cause Tooltip | no | Additional cause information |
| Preventive Control ID / Name | for preventive paths | Stable preventive-control key and display label |
| Preventive Control Tooltip | no | Additional preventive-control information |
| Preventive Control Hierarchy | no | Australian hierarchy-of-controls category |
| Preventive Verification Method | no | One or more verification methods linked to the preventive control |
| Preventive Verification Phase | no | One or more verification phases linked to the preventive control |
| Preventive Before Severity / Probability | no | Risk immediately before the preventive control |
| Preventive After Severity / Probability | no | Risk immediately after the preventive control |
| Hazard ID / Name | yes | Hazard key used by slicers and its display label |
| Hazard Tooltip | no | Additional hazard information |
| Mitigating Control ID / Name | for mitigating paths | Stable mitigating-control key and display label |
| Mitigating Control Tooltip | no | Additional mitigating-control information |
| Mitigating Control Hierarchy | no | Australian hierarchy-of-controls category |
| Mitigating Verification Method | no | One or more verification methods linked to the mitigating control |
| Mitigating Verification Phase | no | One or more verification phases linked to the mitigating control |
| Mitigating Before Severity / Probability | no | Risk immediately before the mitigating control |
| Mitigating After Severity / Probability | no | Risk immediately after the mitigating control |
| Effect ID / Name | for mitigating paths | Stable effect key and display label |
| Effect Tooltip | no | Additional effect information |
| Highlight measure | no | Enables cross-highlighting from other visuals |

Names are used as labels and IDs remain the stable keys. A missing name falls back to its ID. Tooltip fields are free text.

## Row shape

Each row may describe a preventive path, a mitigating path, or both:

```text
Cause -> Before risk -> Preventive control -> After risk -> Hazard
Hazard -> Before risk -> Mitigating control -> After risk -> Effect
```

Left-only and right-only rows are supported. Leave all fields for the unused side blank. This avoids creating a Cartesian product between causes and effects.

Repeat IDs to express relationships:

- Many causes to one preventive control: repeat the preventive control ID with different cause IDs.
- Many preventive controls to one hazard: repeat the hazard ID with different preventive control IDs.
- One hazard to many mitigating controls: repeat the hazard ID with different mitigating control IDs.
- One mitigating control to many effects: repeat the mitigating control ID with different effect IDs.

Nodes and links are de-duplicated by Control Set, element kind, and ID. Repeated rows therefore do not create duplicate visual elements.

## Initial and target controls

Every selected hazard should have rows for both `Initial` and `Target`. The visual also accepts `Current` or `Existing` as Initial aliases and `Proposed` or `Future` as Target aliases.

The two diagrams use separate internal identities, so an element may appear in both control sets without a layout collision. Filtering must leave exactly one distinct Hazard ID; otherwise the visual asks the user to select one.

## Risk assessment

Each control has separate before and after Severity and Probability fields. The visual creates a risk node for each pair and assesses it using MIL-STD-882E Table III.

Accepted severity values are `I`-`IV`, `1`-`4`, or Catastrophic/Critical/Marginal/Negligible. Accepted probability values are `A`-`F`, or Frequent/Probable/Occasional/Remote/Improbable/Eliminated. Missing or invalid pairs display **Not assessed**.

## Hierarchy of controls

Control hierarchy values are normalized to the Australian six-level hierarchy:

1. Eliminate
2. Substitute
3. Isolate
4. Engineering
5. Administrative
6. PPE

Common word variants are accepted. Unknown non-empty values receive a generic `HC` badge and retain their original text in the tooltip.

## Control verification metadata

Preventive and mitigating controls accept independent verification **method** and **phase** lists. Typical methods include `Review`, `Analysis`, `Demonstration`, `Inspection`, and `Test`; typical phases include `FAT`, `SAT`, and `UAT`.

Values may arrive on repeated linked-table rows or as comma-, semicolon-, or pipe-delimited text. The visual trims, case-insensitively de-duplicates, and stably sorts values for each control. Method and phase are independent lists; the visual does not infer pairings between them.

Every distinct value is shown as its own colour-coded badge on the control, for example `V: Review` and `Phase: FAT`. Badges wrap to additional rows without a fixed limit and the control grows vertically to contain them. Full lists also appear in the control tooltip. Badge colours are stable Power BI theme colours with separate namespaces for methods and phases.

The legend includes interactive **Verification method** and **Verification phase** sections. Selecting a legend value hides or shows controls carrying that value; controls without verification metadata are unaffected.

## Multi-table semantic model

The source model may remain normalized across element dimensions and junction tables. Power BI custom visuals receive one categorical query result, however, so the two junctions must be projected into one sparse visual-facing table. Do not bind two disconnected junction tables directly to the visual: fields from both sides can produce a cause-by-effect Cartesian product before the visual receives the data.

The worked model in [sample-data/semantic-model](../sample-data/semantic-model) uses:

- `Hazards`, `Causes`, `PreventiveControls`, `MitigatingControls`, and `Effects` as element dimensions.
- `PreventiveJunction` at the grain Control Set + Hazard + Cause + Preventive Control.
- `MitigatingJunction` at the grain Control Set + Hazard + Mitigating Control + Effect.
- `PreventiveControlVerifications` and `MitigatingControlVerifications` as control-linked verification bridge tables.
- `BowtiePath` as the appended, sparse presentation table consumed by this visual.

```mermaid
erDiagram
	HAZARDS ||--o{ BOWTIE_PATH : HazardId
	CAUSES ||--o{ BOWTIE_PATH : CauseId
	PREVENTIVE_CONTROLS ||--o{ BOWTIE_PATH : PreventiveControlId
	MITIGATING_CONTROLS ||--o{ BOWTIE_PATH : MitigatingControlId
	EFFECTS ||--o{ BOWTIE_PATH : EffectId

	PREVENTIVE_JUNCTION }o--|| HAZARDS : HazardId
	PREVENTIVE_JUNCTION }o--|| CAUSES : CauseId
	PREVENTIVE_JUNCTION }o--|| PREVENTIVE_CONTROLS : PreventiveControlId
	MITIGATING_JUNCTION }o--|| HAZARDS : HazardId
	MITIGATING_JUNCTION }o--|| MITIGATING_CONTROLS : MitigatingControlId
	MITIGATING_JUNCTION }o--|| EFFECTS : EffectId
	PREVENTIVE_CONTROL_VERIFICATIONS }o--|| PREVENTIVE_CONTROLS : PreventiveControlId
	MITIGATING_CONTROL_VERIFICATIONS }o--|| MITIGATING_CONTROLS : MitigatingControlId
```

### Build `BowtiePath`

1. Load the nine CSV files from [sample-data/semantic-model](../sample-data/semantic-model) as queries named `Hazards`, `Causes`, `PreventiveControls`, `MitigatingControls`, `Effects`, `PreventiveJunction`, `MitigatingJunction`, `PreventiveControlVerifications`, and `MitigatingControlVerifications`.
2. Create a blank Power Query named `BowtiePath` and paste in [BowtiePath.pq](../sample-data/semantic-model/BowtiePath.pq).
3. The query joins descriptive fields onto each junction independently, adds null columns for the opposite side, and appends the results. This preserves each junction's grain and avoids multiplying preventive rows by mitigating rows.
4. Disable load for the two raw junction queries if they are only staging queries. Keep the five dimensions loaded when they are used by slicers or other report visuals.

Create one-to-many, single-direction relationships from each dimension ID to its matching `BowtiePath` ID. Keep filter direction from dimension to `BowtiePath`; bidirectional relationships are unnecessary and can introduce ambiguous filter paths. The two control dimensions are deliberately role-specific. If controls originate in one source table, create two referenced Power Query dimensions or two role-playing model tables.

Bind all 30 categorical field wells from `BowtiePath`. Use `Hazards[HazardName]` or `Hazards[HazardId]` in a single-select slicer; its relationship filters `BowtiePath` to the selected hazard. Other dimension slicers can filter the table in the same way.

Risk values belong on the junction assignment, not the control dimension, because the same control may have different assessed risk for different hazards, causes/effects, or Initial/Target sets. Hierarchy and tooltip attributes normally belong on their element dimensions. Verification metadata is control-level: `BowtiePath.pq` first aggregates each verification bridge to one row per control and only then joins it to the path, preventing verification records from multiplying cause/effect relationship rows.

## Power BI setup

For a single-table source:

1. Load [the flat sample CSV](../sample-data/bowtie.csv).
2. Bind each CSV column to its matching field well.
3. Add a slicer using Hazard ID or Hazard Name and enable single selection.
4. Select one hazard. Both Initial and Target bowties render in the same visual.

For a normalized semantic model, follow [Multi-table semantic model](#multi-table-semantic-model) and bind the resulting `BowtiePath` fields instead.

The sample includes two hazards, shared controls, every supported relationship cardinality, all six hierarchy categories, optional tooltip blanks, and representative risk levels.
