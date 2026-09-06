# Data shape for the Safety Bowtie visual (MIL-STD-882E)

The visual consumes a **single flattened relationship table**: one row per
link between two artefacts. Nodes are derived automatically as the union of
all `Source ID` and `Target ID` values.

The same flattened table renders a **bowtie**: the unique `Hazard`-typed node
becomes the **top event** at the centre; each remaining node's side is derived
from link direction — nodes that can reach the top event form the **causal
side** (left: causal factors and preventive controls), and nodes reachable
from the top event form the **mishap side** (right: mitigative controls and
mishaps). See [Bowtie conventions (MIL-STD-882E)](#bowtie-conventions-mil-std-882e)
for the derivation rules.

This flattened table doesn't have to be your source data shape. If your data
is naturally normalized — an **Artefacts** table (one row per artefact) and a
**Links** table (one row per relationship) — see
[Two-table input (Artefacts + Links)](#two-table-input-artefacts--links) below
for how to combine them.

## Field wells

| Field well | Required | Purpose |
|---|---|---|
| Source ID | yes | Unique artefact ID at the start of the link |
| Target ID | yes | Unique artefact ID the link points to (arrow end) |
| Link Type | no | Relationship name — drawn as the edge label and used for edge colour (bowtie convention: `causes` into the hazard, `results-in` out of it, `mitigates` from a control) |
| Source Artefact Type / Target Artefact Type | no | Artefact type of each endpoint (e.g. `Hazard`, `Causal Factor`, `Mishap`, `Control`, plus legacy SE types such as `SEMP`, `SSMP`, `Requirement`). Drives node colour, icon and bowtie placement |
| Source Program / Target Program | no | Program each artefact belongs to. Drives the legend program filter |
| Source Classification / Target Classification | no | Security classification chip (e.g. `OFFICIAL`, `OFFICIAL: Sensitive`, `PROTECTED`, `SECRET`) |
| Source Caveat / Target Caveat | no | Caveat chip (e.g. `AUSTEO`, `REL`, `FVEY`) |
| Source Status / Target Status | no | Lifecycle status — drives node border style (`Draft` = dashed, `Approved` = solid green, `Baseline` = solid blue, `Superseded` = dotted red) |
| Source Severity / Target Severity | no | MIL-STD-882E severity category of the artefact (Table I): `I`/`Catastrophic`, `II`/`Critical`, `III`/`Marginal`, `IV`/`Negligible`. With probability, drives the assessed mishap risk |
| Source Probability / Target Probability | no | MIL-STD-882E probability level of the artefact (Table II): `A`/`Frequent`, `B`/`Probable`, `C`/`Occasional`, `D`/`Remote`, `E`/`Improbable`, `F`/`Eliminated` |
| Source URL / Target URL | no | Link to open the artefact (e.g. a document management system URL). Ctrl/Cmd+Click a node to open its link in a new tab; shown as a hint in the tooltip |
| Source Short Name / Target Short Name | no | Short display name for the artefact — shown in the tooltip |
| Source Long Name / Target Long Name | no | Full/long-form name for the artefact — shown in the tooltip |
| Source Scope / Target Scope | no | Ownership scope of the artefact (e.g. `Contractor 1`, `Internal`) — shown in the tooltip |
| Source Version / Target Version | no | Artefact version/revision — shown in the tooltip |
| Source External ID / Target External ID | no | Identifier from an external system of record — shown in the tooltip |
| Source DMS ID / Target DMS ID | no | Document management system identifier — shown in the tooltip |
| Highlight measure | no | Optional measure that enables cross-highlighting this visual from other visuals/slicers on the page |

See [sample-data/links.csv](../sample-data/links.csv) and
[sample-data/artefacts.csv](../sample-data/artefacts.csv) for a worked bowtie
example: a *Loss of Navigation* hazard with two causal factors (GNSS jamming,
IMU failure), preventive controls (redundant GPS, inertial backup, EMC
shielding), three mishaps with severity/probability spanning all four 882E
risk levels, and mitigative controls (TAWS, emergency diversion procedure) —
including an `Export Controlled` caveat and Source/Target URLs. See
[Two-table input (Artefacts + Links)](#two-table-input-artefacts--links) for
how these two normalized files are combined into the flattened shape above.

## Bowtie conventions (MIL-STD-882E)

The visual derives the bowtie shape from the data — you don't pin positions:

- **Top event (knot).** The unique `Hazard`-typed artefact. If several
  hazards exist, the most-connected one is used (ties break by ID); if none
  exists, the most-connected artefact overall becomes the top event and a
  note is shown so the visual still renders non-bowtie data.
- **Sides.** Following link direction from the top event: anything that can
  *reach* it sits on the **causal side** (left); anything *reachable from* it
  sits on the **mishap side** (right). A node on a cycle resolves to the
  nearer side (ties break left). Nodes with no path to or from the top event
  lie outside the bowtie and are hidden, with a count shown in the corner.
- **Controls.** A control takes the side of the non-hazard node it attaches
  to. A control attached only to the hazard is **preventive** when its edge
  points *into* the hazard (e.g. `Control —mitigates→ Hazard`) and
  **mitigative** when the edge *leaves* the hazard (e.g.
  `Hazard —mitigated-by→ Control`). The recommended convention is to point
  control edges at the threat/mishap line they protect:
  `Control —mitigates→ CausalFactor` on the left and
  `Control —mitigates→ Mishap` on the right.
- **Suggested link types.** `causes` (causal factor → hazard),
  `results-in` (hazard → mishap), `mitigates` / `mitigated-by` (control
  links). Other link types still render and are coloured as before.
- **Suggested artefact types.** `Hazard` (top event), `Causal Factor`,
  `Mishap`, `Control`. Type matching is keyword-based, so `Threat`,
  `Consequence`, `Loss event`, `Barrier` etc. also resolve; anything else
  keeps its colour and joins the side its links place it on.
- **Mishap risk.** When both severity and probability are bound for a hazard
  or mishap, the visual assesses the mishap risk per 882E Table III
  (High/Serious/Medium/Low), colours the node by it, and adds an H/S/M/L
  badge. Accepted values: severity `I`–`IV`, `1`–`4` or the category names;
  probability `A`–`F` or the level names. Probability `F` (Eliminated)
  assesses as Low. Both can be toggled in the format pane (**Mishap risk
  (MIL-STD-882E)** card).

## Two-table input (Artefacts + Links)

If your source system stores artefacts and links as two separate tables
rather than one flattened export, you don't need to change anything about
how the visual is bound — its data roles just need to resolve to the columns
above by the time Power BI queries them. Two supported ways to get there:

### Option 1 — Power Query merge

Merge `Links` with `Artefacts` twice (once per endpoint) and expand the
attribute columns with a `Source`/`Target` prefix:

```m
let
    Source = Links,
    MergeSource = Table.NestedJoin(Source, {"SourceId"}, Artefacts, {"ArtefactId"}, "SourceArtefact", JoinKind.LeftOuter),
    ExpandSource = Table.ExpandTableColumn(MergeSource, "SourceArtefact",
        {"Type","Program","Classification","Caveat","Status","Url","ShortName","LongName","Scope","Version","ExternalId","DmsId","Severity","Probability"},
        {"SourceType","SourceProgram","SourceClassification","SourceCaveat","SourceStatus","SourceUrl","SourceShortName","SourceLongName","SourceScope","SourceVersion","SourceExternalId","SourceDmsId","SourceSeverity","SourceProbability"}),
    MergeTarget = Table.NestedJoin(ExpandSource, {"TargetId"}, Artefacts, {"ArtefactId"}, "TargetArtefact", JoinKind.LeftOuter),
    ExpandTarget = Table.ExpandTableColumn(MergeTarget, "TargetArtefact",
        {"Type","Program","Classification","Caveat","Status","Url","ShortName","LongName","Scope","Version","ExternalId","DmsId","Severity","Probability"},
        {"TargetType","TargetProgram","TargetClassification","TargetCaveat","TargetStatus","TargetUrl","TargetShortName","TargetLongName","TargetScope","TargetVersion","TargetExternalId","TargetDmsId","TargetSeverity","TargetProbability"})
in
    ExpandTarget
```

The result is exactly the flattened shape described in **Field wells** above
— bind its columns to the matching roles.

### Option 2 — relationship-based (no merge step)

If you'd rather keep `Artefacts` and `Links` as separate model tables:

1. Duplicate `Artefacts` as a role-playing `Artefacts (Target)` table
   (reference the query in Power Query, or duplicate the table in the model).
2. Create two relationships: `Links[SourceId] → Artefacts[ArtefactId]` and
   `Links[TargetId] → Artefacts (Target)[ArtefactId]`.
3. Bind `Source ID`/`Link Type` from `Links`, `Source Artefact Type`/
   `Source Program`/etc. from `Artefacts`, and the `Target *` roles from
   `Artefacts (Target)`. Power BI's query engine joins them automatically —
   no Power Query merge step required.

Either option produces the same result the visual sees; pick whichever is
easier to maintain in your model.

## Notes

- **De-duplicate rows.** If the source system emits the same relationship
  more than once, remove duplicates in Power Query — on the `Links` table
  itself if using the two-table input (*Home → Remove Rows → Remove
  Duplicates* on `SourceId` + `TargetId` + `LinkType`), or on the merged
  result otherwise. The visual also de-duplicates defensively.
- **Endpoint attributes may repeat.** Each artefact's type/program/
  classification can be repeated on every row it participates in; the visual
  takes the first non-empty value it sees for each artefact.
- **If your source data is a node table** (one row per artefact with a
  *Reports-To / Derived-From* column), reshape it in Power Query: duplicate
  the query, and self-join `Derived-From → Artefact ID` to produce the
  relationship table above.
- **Classification names are display strings.** The visual recognises common
  PSPF values for colouring (OFFICIAL → green, OFFICIAL: Sensitive → amber,
  PROTECTED → orange, SECRET → red), and falls back to a neutral grey chip
  for anything else. No classification handling logic is enforced — this is a
  display-only label.
- **Caveats are display strings too.** Recognised values get a distinct chip
  colour (`AUSTEO`/Australian Eyes Only → blue, `FVEY`/Five Eyes → purple,
  `Export Controlled`/`ITAR`/`EAR99`/`DTC` → red, `REL`/Releasable → teal);
  anything else falls back to a neutral grey chip. Any free-text value is
  accepted — colouring is cosmetic only.

## Colour and icon defaults

| Type contains | Node colour | Glyph |
|---|---|---|
| threat / causal factor / cause | brown | F |
| hazard / risk | orange | ! |
| control / mitigation / barrier | gold | C |
| mishap / consequence / loss event | red | M |
| SEMP / OCD / SSMP / plan / doc | blue | D |
| spec | green | S |
| verif / test / VCRM | purple | V |
| req | cyan | R |
| anything else | grey | ? |

When severity **and** probability are bound, hazard and mishap nodes are
instead coloured by their assessed mishap risk (882E Table III): **High** =
red, **Serious** = orange, **Medium** = amber, **Low** = green, plus an
H/S/M/L badge in the corner of the node. A conditional-formatting (rule-based)
node colour, when present, still wins over both.

All colours are overridable in the format pane (**Colors** card).
