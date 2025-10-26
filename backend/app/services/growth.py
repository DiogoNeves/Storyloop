"""Growth score service placeholder implementations."""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class GrowthScoreService:
    """Placeholder service for Storyloop growth score maintenance."""

    def recalculate_growth_score(self) -> None:
        """Log a placeholder recalculation until real metrics are wired in."""
        logger.info("Pretending to recalculate growth score aggregates.")

