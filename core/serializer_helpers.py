from rest_framework import serializers


def normalize_legacy_election_flag(data):
    """Map the deprecated ``is_active`` input to ``voting_enabled``."""
    normalized = data.copy()
    if "is_active" not in normalized:
        return normalized

    boolean = serializers.BooleanField()
    legacy_raw_value = normalized.pop("is_active")
    try:
        legacy_value = boolean.run_validation(legacy_raw_value)
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({"is_active": exc.detail}) from exc

    if "voting_enabled" in normalized:
        try:
            new_value = boolean.run_validation(normalized["voting_enabled"])
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"voting_enabled": exc.detail}) from exc
        if legacy_value != new_value:
            raise serializers.ValidationError({
                "voting_enabled": "Conflicts with the deprecated is_active field."
            })
    else:
        normalized["voting_enabled"] = legacy_value

    return normalized
