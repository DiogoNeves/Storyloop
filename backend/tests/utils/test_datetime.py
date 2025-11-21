import pytest
from datetime import datetime, timezone
from app.utils.datetime import parse_datetime, parse_duration_seconds

class TestParseDatetime:
    def test_parse_valid_iso(self):
        """Test parsing valid ISO 8601 timestamps."""
        assert parse_datetime("2023-01-01T12:00:00") == datetime(2023, 1, 1, 12, 0, 0)
        assert parse_datetime("2023-01-01T12:00:00+00:00") == datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    def test_parse_z_suffix(self):
        """Test parsing timestamps ending with Z."""
        assert parse_datetime("2023-01-01T12:00:00Z") == datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

    def test_parse_missing_value(self):
        """Test parsing missing or empty values."""
        with pytest.raises(ValueError, match="Timestamp missing"):
            parse_datetime(None)
        with pytest.raises(ValueError, match="Timestamp missing"):
            parse_datetime("")

    def test_parse_invalid_format(self):
        """Test parsing invalid formats."""
        with pytest.raises(ValueError):
            parse_datetime("invalid-date")

class TestParseDurationSeconds:
    def test_parse_pt_formats(self):
        """Test parsing standard PT duration formats."""
        assert parse_duration_seconds("PT1H") == 3600
        assert parse_duration_seconds("PT1M") == 60
        assert parse_duration_seconds("PT1S") == 1
        assert parse_duration_seconds("PT1H1M1S") == 3661
        assert parse_duration_seconds("PT0S") == 0

    def test_parse_p_formats(self):
        """Test parsing P duration formats (days)."""
        assert parse_duration_seconds("P1D") == 86400
        assert parse_duration_seconds("P0D") == 0
        assert parse_duration_seconds("P1DT1H") == 90000  # 86400 + 3600
        assert parse_duration_seconds("P2D") == 172800

    def test_parse_none_empty(self):
        """Test parsing None or empty strings."""
        assert parse_duration_seconds(None) is None
        assert parse_duration_seconds("") is None

    def test_parse_invalid_prefix(self):
        """Test parsing strings with invalid prefixes."""
        assert parse_duration_seconds("1H") is None
        assert parse_duration_seconds("T1H") is None
        # Should log warning but return None
        assert parse_duration_seconds("INVALID") is None
