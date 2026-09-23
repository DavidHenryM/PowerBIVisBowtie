# Import the semantic model into Power BI

This guide builds the normalized sample model and connects it to the Bowtie visual. It uses the CSV files in [sample-data/semantic-model](../sample-data/semantic-model).

## 1. Load the source CSV files

In Power BI Desktop, select **Home > Get data > Text/CSV** and load each file with the exact query name below:

| Query name | File | Purpose |
|---|---|---|
| `hazards` | `hazards.csv` | Hazard/top-event dimension |
| `causes` | `causes.csv` | Cause dimension |
| `preventivecontrols` | `preventive-controls.csv` | Preventive-control dimension |
| `mitigatingcontrols` | `mitigating-controls.csv` | Mitigating-control dimension |
| `effects` | `effects.csv` | Effect/outcome dimension |
| `preventivejunction` | `preventive-junction.csv` | Preventive paths and risk assignments |
| `mitigatingjunction` | `mitigating-junction.csv` | Mitigating paths and risk assignments |
| `preventivecontrolverifications` | `preventive-control-verifications.csv` | Preventive verification bridge |
| `mitigatingcontrolverifications` | `mitigating-control-verifications.csv` | Mitigating verification bridge |

The query names matter because `BowtiePath.pq` references them directly. Rename queries in the Power Query Editor if Power BI assigns different names.

## 2. Create the presentation query

1. Open **Home > Transform data**.
2. Select **New source > Blank query**.
3. Open **Advanced Editor**.
4. Replace the editor contents with [BowtiePath.pq](../sample-data/semantic-model/BowtiePath.pq).
5. Name the query `bowtiepath`.
6. Select **Close & Apply**.

`bowtiepath` independently joins the preventive and mitigating junctions to their dimensions, aggregates verification metadata, adds null columns for the opposite side, and appends the two sparse path tables. This avoids creating a preventive-by-mitigating Cartesian product.

## 3. Configure the model

Create these one-to-many relationships, with single-direction filtering from the dimension to `BowtiePath`:

| From dimension | Column | To | Column |
|---|---|---|---|
| `hazards` | `HazardId` | `bowtiepath` | `HazardId` |
| `causes` | `CauseId` | `bowtiepath` | `CauseId` |
| `preventivecontrols` | `PreventiveControlId` | `bowtiepath` | `PreventiveControlId` |
| `mitigatingcontrols` | `MitigatingControlId` | `bowtiepath` | `MitigatingControlId` |
| `effects` | `EffectId` | `bowtiepath` | `EffectId` |

Do not create direct relationships from the verification bridge tables to `bowtiepath`; verification data is already aggregated into the path by `BowtiePath.pq`. Do not relate the two junction tables directly to each other.

The raw junction and verification queries may have **Enable load** disabled if they are used only as Power Query staging inputs. Keep the five dimension tables loaded if they will drive slicers or other report visuals, and keep `bowtiepath` loaded.

## 4. Add the visual

1. Import the current `.pbiviz` package from the repository `dist` folder.
2. Add **Bowtie (MIL-STD-882E)** to the report canvas.
3. Bind the 34 categorical fields from `bowtiepath` to their matching wells. The contract includes:
   - control set, cause, hazard, effect, and control IDs/names/tooltips;
   - preventive and mitigating hierarchy and verification method/phase;
   - before/after severity and probability;
   - optional before/after risk levels for both control sides.
4. Add a single-select slicer using `Hazards[HazardName]` or `Hazards[HazardId]`.
5. Select one hazard. The visual then renders the combined Initial and Additional bowtie.

Risk severity and probability are assigned in the junction tables because the same control can have different assessments by hazard, path, or control set. When a valid severity/probability pair is present, the visual derives the MIL-STD-882E risk level. An imported risk-level field is used only when the pair is unavailable.

For a path with both control sets, the Initial control's after-risk is the intermediate risk. From that point, a dashed bypass goes directly to the next event, while a solid branch passes through the Additional control and its final risk. The final risk after the Additional control is the resultant risk.

## Troubleshooting

- **Expression.Error: name not recognized**: confirm that all nine source queries use the exact lowercase names in the table above.
- **Missing fields in bowtiepath**: refresh the query after replacing the full `BowtiePath.pq` text, then check that the 34 output columns are present.
- **No diagram**: filter to exactly one `HazardId` and confirm that `BowtiePath[HazardId]` is bound.
- **Missing verification badges**: confirm that bridge IDs match the corresponding control dimension IDs.
- **Rows appear multiplied**: remove direct junction-to-junction relationships and use only the sparse `bowtiepath` output for the visual.