"""Render context for sketches."""

from pathlib import Path

from numbrane_python.core.config import Quality
from numbrane_python.core.rng import RNG


class RenderContext:
    """Context provided to sketches during rendering."""

    def __init__(
        self,
        rng: RNG,
        width: int,
        height: int,
        frame: int = 0,
        time: float = 0.0,
        quality: Quality = None,
        output_dir: Path | None = None,
    ):
        """Initialize render context.

        Args:
            rng: Deterministic random number generator
            width: Canvas width
            height: Canvas height
            frame: Frame number (for animations)
            time: Normalized time [0, 1] (for animations)
            quality: Quality settings
            output_dir: Output directory for saving artifacts
        """
        self.rng = rng
        self.width = width
        self.height = height
        self.frame = frame
        self.time = time
        self.quality = quality or Quality()
        self.output_dir = output_dir or Path.cwd()

    def fork(self, frame: int | None = None, time: float | None = None) -> "RenderContext":
        """Create a new context for a different frame/time.

        Args:
            frame: New frame number
            time: New normalized time

        Returns:
            New context with forked RNG
        """
        new_rng = self.rng.fork(offset=frame if frame is not None else self.frame)
        return RenderContext(
            rng=new_rng,
            width=self.width,
            height=self.height,
            frame=frame if frame is not None else self.frame,
            time=time if time is not None else self.time,
            quality=self.quality,
            output_dir=self.output_dir,
        )
