let
    AddNullColumns = (source as table, columns as list) as table =>
        List.Accumulate(
            columns,
            source,
            (state as table, columnName as text) =>
                if Table.HasColumns(state, columnName)
                then state
                else Table.AddColumn(state, columnName, each null, type nullable text)
        ),

    DistinctText = (values as list) as nullable text =>
        let
            Clean = List.Select(List.Transform(values, each if _ = null then "" else Text.Trim(Text.From(_))), each _ <> ""),
            Distinct = List.Sort(List.Distinct(Clean, Comparer.OrdinalIgnoreCase))
        in
            if List.IsEmpty(Distinct) then null else Text.Combine(Distinct, ", "),

    PreventiveVerification = Table.Group(
        PreventiveControlVerifications,
        {"PreventiveControlId"},
        {
            {"PreventiveVerificationMethod", each DistinctText([VerificationMethod]), type nullable text},
            {"PreventiveVerificationPhase", each DistinctText([VerificationPhase]), type nullable text}
        }),
    PreventiveControlsJoined = Table.NestedJoin(
        PreventiveControls, {"PreventiveControlId"}, PreventiveVerification, {"PreventiveControlId"}, "Verification", JoinKind.LeftOuter),
    PreventiveControlsExpanded = Table.ExpandTableColumn(
        PreventiveControlsJoined, "Verification", {"PreventiveVerificationMethod", "PreventiveVerificationPhase"}),

    PreventiveHazard = Table.NestedJoin(
        PreventiveJunction, {"HazardId"}, Hazards, {"HazardId"}, "Hazard", JoinKind.LeftOuter),
    PreventiveHazardExpanded = Table.ExpandTableColumn(
        PreventiveHazard, "Hazard", {"HazardName", "HazardTooltip"}),
    PreventiveCause = Table.NestedJoin(
        PreventiveHazardExpanded, {"CauseId"}, Causes, {"CauseId"}, "Cause", JoinKind.LeftOuter),
    PreventiveCauseExpanded = Table.ExpandTableColumn(
        PreventiveCause, "Cause", {"CauseName", "CauseTooltip"}),
    PreventiveControl = Table.NestedJoin(
        PreventiveCauseExpanded,
        {"PreventiveControlId"},
        PreventiveControlsExpanded,
        {"PreventiveControlId"},
        "PreventiveControl",
        JoinKind.LeftOuter),
    PreventiveExpanded = Table.ExpandTableColumn(
        PreventiveControl,
        "PreventiveControl",
        {"PreventiveControlName", "PreventiveControlTooltip", "PreventiveControlHierarchy", "PreventiveVerificationMethod", "PreventiveVerificationPhase"}),
    PreventiveComplete = AddNullColumns(
        PreventiveExpanded,
        {
            "MitigatingControlId", "MitigatingControlName", "MitigatingControlTooltip",
            "MitigatingControlHierarchy", "MitigatingVerificationMethod", "MitigatingVerificationPhase",
            "MitigatingBeforeSeverity", "MitigatingBeforeProbability",
            "MitigatingAfterSeverity", "MitigatingAfterProbability", "EffectId", "EffectName", "EffectTooltip"
        }),

    MitigatingVerification = Table.Group(
        MitigatingControlVerifications,
        {"MitigatingControlId"},
        {
            {"MitigatingVerificationMethod", each DistinctText([VerificationMethod]), type nullable text},
            {"MitigatingVerificationPhase", each DistinctText([VerificationPhase]), type nullable text}
        }),
    MitigatingControlsJoined = Table.NestedJoin(
        MitigatingControls, {"MitigatingControlId"}, MitigatingVerification, {"MitigatingControlId"}, "Verification", JoinKind.LeftOuter),
    MitigatingControlsExpanded = Table.ExpandTableColumn(
        MitigatingControlsJoined, "Verification", {"MitigatingVerificationMethod", "MitigatingVerificationPhase"}),

    MitigatingHazard = Table.NestedJoin(
        MitigatingJunction, {"HazardId"}, Hazards, {"HazardId"}, "Hazard", JoinKind.LeftOuter),
    MitigatingHazardExpanded = Table.ExpandTableColumn(
        MitigatingHazard, "Hazard", {"HazardName", "HazardTooltip"}),
    MitigatingControl = Table.NestedJoin(
        MitigatingHazardExpanded,
        {"MitigatingControlId"},
        MitigatingControlsExpanded,
        {"MitigatingControlId"},
        "MitigatingControl",
        JoinKind.LeftOuter),
    MitigatingControlExpanded = Table.ExpandTableColumn(
        MitigatingControl,
        "MitigatingControl",
        {"MitigatingControlName", "MitigatingControlTooltip", "MitigatingControlHierarchy", "MitigatingVerificationMethod", "MitigatingVerificationPhase"}),
    MitigatingEffect = Table.NestedJoin(
        MitigatingControlExpanded, {"EffectId"}, Effects, {"EffectId"}, "Effect", JoinKind.LeftOuter),
    MitigatingExpanded = Table.ExpandTableColumn(
        MitigatingEffect, "Effect", {"EffectName", "EffectTooltip"}),
    MitigatingComplete = AddNullColumns(
        MitigatingExpanded,
        {
            "CauseId", "CauseName", "CauseTooltip", "PreventiveControlId", "PreventiveControlName",
            "PreventiveControlTooltip", "PreventiveControlHierarchy", "PreventiveVerificationMethod",
            "PreventiveVerificationPhase", "PreventiveBeforeSeverity",
            "PreventiveBeforeProbability", "PreventiveAfterSeverity", "PreventiveAfterProbability"
        }),

    Combined = Table.Combine({PreventiveComplete, MitigatingComplete}),
    Columns = {
        "ControlSet", "CauseId", "CauseName", "CauseTooltip", "PreventiveControlId",
        "PreventiveControlName", "PreventiveControlTooltip", "PreventiveControlHierarchy",
        "PreventiveVerificationMethod", "PreventiveVerificationPhase",
        "PreventiveBeforeSeverity", "PreventiveBeforeProbability", "PreventiveAfterSeverity",
        "PreventiveAfterProbability", "HazardId", "HazardName", "HazardTooltip",
        "MitigatingControlId", "MitigatingControlName", "MitigatingControlTooltip",
        "MitigatingControlHierarchy", "MitigatingVerificationMethod", "MitigatingVerificationPhase",
        "MitigatingBeforeSeverity", "MitigatingBeforeProbability",
        "MitigatingAfterSeverity", "MitigatingAfterProbability", "EffectId", "EffectName", "EffectTooltip"
    },
    BowtiePath = Table.ReorderColumns(Combined, Columns)
in
    BowtiePath
