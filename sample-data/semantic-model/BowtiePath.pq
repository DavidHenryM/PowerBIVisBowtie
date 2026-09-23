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
        #"preventive-control-verifications",
        {"PreventiveControlId"},
        {
            {"PreventiveVerificationMethod", each DistinctText([VerificationMethod]), type nullable text},
            {"PreventiveVerificationPhase", each DistinctText([VerificationPhase]), type nullable text}
        }),
    PreventiveControlsJoined = Table.NestedJoin(
        #"preventive-controls", {"PreventiveControlId"}, PreventiveVerification, {"PreventiveControlId"}, "Verification", JoinKind.LeftOuter),
    PreventiveControlsExpanded = Table.ExpandTableColumn(
        PreventiveControlsJoined, "Verification", {"PreventiveVerificationMethod", "PreventiveVerificationPhase"}),

    PreventiveHazard = Table.NestedJoin(
        #"preventive-junction", {"HazardId"}, #"hazards", {"HazardId"}, "Hazard", JoinKind.LeftOuter),
    PreventiveHazardExpanded = Table.ExpandTableColumn(
        PreventiveHazard, "Hazard", {"HazardName", "HazardTooltip"}),
    PreventiveCause = Table.NestedJoin(
        PreventiveHazardExpanded, {"CauseId"}, #"causes", {"CauseId"}, "Cause", JoinKind.LeftOuter),
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
            "MitigatingAfterSeverity", "MitigatingAfterProbability", "MitigatingBeforeRisk", "MitigatingAfterRisk", "EffectId", "EffectName", "EffectTooltip"
        }),

    MitigatingVerification = Table.Group(
        #"mitigating-control-verifications",
        {"MitigatingControlId"},
        {
            {"MitigatingVerificationMethod", each DistinctText([VerificationMethod]), type nullable text},
            {"MitigatingVerificationPhase", each DistinctText([VerificationPhase]), type nullable text}
        }),
    MitigatingControlsJoined = Table.NestedJoin(
        #"mitigating-controls", {"MitigatingControlId"}, MitigatingVerification, {"MitigatingControlId"}, "Verification", JoinKind.LeftOuter),
    MitigatingControlsExpanded = Table.ExpandTableColumn(
        MitigatingControlsJoined, "Verification", {"MitigatingVerificationMethod", "MitigatingVerificationPhase"}),

    MitigatingHazard = Table.NestedJoin(
        #"mitigating-junction", {"HazardId"}, #"hazards", {"HazardId"}, "Hazard", JoinKind.LeftOuter),
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
        MitigatingControlExpanded, {"EffectId"}, #"effects", {"EffectId"}, "Effect", JoinKind.LeftOuter),
    MitigatingExpanded = Table.ExpandTableColumn(
        MitigatingEffect, "Effect", {"EffectName", "EffectTooltip"}),
    MitigatingComplete = AddNullColumns(
        MitigatingExpanded,
        {
            "CauseId", "CauseName", "CauseTooltip", "PreventiveControlId", "PreventiveControlName",
            "PreventiveControlTooltip", "PreventiveControlHierarchy", "PreventiveVerificationMethod",
            "PreventiveVerificationPhase", "PreventiveBeforeSeverity",
            "PreventiveBeforeProbability", "PreventiveBeforeRisk", "PreventiveAfterSeverity", "PreventiveAfterProbability", "PreventiveAfterRisk"
        }),

    Combined = Table.Combine({PreventiveComplete, MitigatingComplete}),
    Columns = {
        "ControlSet", "CauseId", "CauseName", "CauseTooltip", "PreventiveControlId",
        "PreventiveControlName", "PreventiveControlTooltip", "PreventiveControlHierarchy",
        "PreventiveVerificationMethod", "PreventiveVerificationPhase",
        "PreventiveBeforeSeverity", "PreventiveBeforeProbability", "PreventiveAfterSeverity",
        "PreventiveBeforeRisk", "PreventiveAfterProbability", "PreventiveAfterRisk", "HazardId", "HazardName", "HazardTooltip",
        "MitigatingControlId", "MitigatingControlName", "MitigatingControlTooltip",
        "MitigatingControlHierarchy", "MitigatingVerificationMethod", "MitigatingVerificationPhase",
        "MitigatingBeforeSeverity", "MitigatingBeforeProbability",
        "MitigatingBeforeRisk", "MitigatingAfterSeverity", "MitigatingAfterProbability",
        "MitigatingAfterRisk", "EffectId", "EffectName", "EffectTooltip"
    },
    bowtiepath = Table.ReorderColumns(Combined, Columns)
in
    bowtiepath
