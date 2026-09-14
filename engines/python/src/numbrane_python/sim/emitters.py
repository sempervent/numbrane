"""Particle emitters."""

from abc import ABC, abstractmethod

import numpy as np

from numbrane_python.core.rng import RNG
from numbrane_python.sim.particles import Particle


class Emitter(ABC):
    """Abstract particle emitter."""

    @abstractmethod
    def emit(self, rng: RNG, n: int, bounds: tuple[int, int, int, int]) -> list[Particle]:
        """Emit particles.

        Args:
            rng: Random number generator
            n: Number of particles to emit
            bounds: (min_x, min_y, max_x, max_y) bounds

        Returns:
            List of new particles
        """
        pass


class BorderEmitter(Emitter):
    """Emit particles from border of bounds."""

    def __init__(self, width: float = 1.0, speed: float = 1.0, color_idx: int = 0):
        """Initialize border emitter.

        Args:
            width: Particle width
            speed: Initial speed
            color_idx: Color index
        """
        self.width = width
        self.speed = speed
        self.color_idx = color_idx

    def emit(self, rng: RNG, n: int, bounds: tuple[int, int, int, int]) -> list[Particle]:
        """Emit from border."""
        min_x, min_y, max_x, max_y = bounds
        particles = []

        for i in range(n):
            # Choose random edge
            edge = rng.integers(0, 4)

            if edge == 0:  # Top
                x = rng.uniform(min_x, max_x)
                y = min_y
                vx = rng.normal(0, 0.1)
                vy = rng.uniform(0.1, self.speed)
            elif edge == 1:  # Right
                x = max_x
                y = rng.uniform(min_y, max_y)
                vx = -rng.uniform(0.1, self.speed)
                vy = rng.normal(0, 0.1)
            elif edge == 2:  # Bottom
                x = rng.uniform(min_x, max_x)
                y = max_y
                vx = rng.normal(0, 0.1)
                vy = -rng.uniform(0.1, self.speed)
            else:  # Left
                x = min_x
                y = rng.uniform(min_y, max_y)
                vx = rng.uniform(0.1, self.speed)
                vy = rng.normal(0, 0.1)

            particles.append(
                Particle(
                    pos=np.array([x, y], dtype=np.float32),
                    vel=np.array([vx, vy], dtype=np.float32),
                    age=0.0,
                    width=self.width,
                    color_idx=self.color_idx,
                    branch_id=i,
                )
            )

        return particles


class RandomEmitter(Emitter):
    """Emit particles at random positions."""

    def __init__(self, width: float = 1.0, speed: float = 1.0, color_idx: int = 0):
        """Initialize random emitter.

        Args:
            width: Particle width
            speed: Initial speed
            color_idx: Color index
        """
        self.width = width
        self.speed = speed
        self.color_idx = color_idx

    def emit(self, rng: RNG, n: int, bounds: tuple[int, int, int, int]) -> list[Particle]:
        """Emit at random positions."""
        min_x, min_y, max_x, max_y = bounds
        particles = []

        for i in range(n):
            x = rng.uniform(min_x, max_x)
            y = rng.uniform(min_y, max_y)
            angle = rng.uniform(0, 2 * np.pi)
            speed = rng.uniform(0, self.speed)

            particles.append(
                Particle(
                    pos=np.array([x, y], dtype=np.float32),
                    vel=np.array([np.cos(angle) * speed, np.sin(angle) * speed], dtype=np.float32),
                    age=0.0,
                    width=self.width,
                    color_idx=self.color_idx,
                    branch_id=i,
                )
            )

        return particles


class AttractorEmitter(Emitter):
    """Emit particles toward attractor points."""

    def __init__(
        self, attractors: np.ndarray, width: float = 1.0, speed: float = 1.0, color_idx: int = 0
    ):
        """Initialize attractor emitter.

        Args:
            attractors: Array of (x, y) attractor points
            width: Particle width
            speed: Initial speed
            color_idx: Color index
        """
        self.attractors = attractors
        self.width = width
        self.speed = speed
        self.color_idx = color_idx

    def emit(self, rng: RNG, n: int, bounds: tuple[int, int, int, int]) -> list[Particle]:
        """Emit toward attractors."""
        min_x, min_y, max_x, max_y = bounds
        particles = []

        for i in range(n):
            # Random position
            x = rng.uniform(min_x, max_x)
            y = rng.uniform(min_y, max_y)

            # Choose random attractor
            if len(self.attractors) > 0:
                attractor = self.attractors[rng.integers(0, len(self.attractors))]
                dx = attractor[0] - x
                dy = attractor[1] - y
                dist = np.sqrt(dx**2 + dy**2)
                if dist > 0:
                    vx = (dx / dist) * self.speed
                    vy = (dy / dist) * self.speed
                else:
                    vx = rng.uniform(-self.speed, self.speed)
                    vy = rng.uniform(-self.speed, self.speed)
            else:
                angle = rng.uniform(0, 2 * np.pi)
                vx = np.cos(angle) * self.speed
                vy = np.sin(angle) * self.speed

            particles.append(
                Particle(
                    pos=np.array([x, y], dtype=np.float32),
                    vel=np.array([vx, vy], dtype=np.float32),
                    age=0.0,
                    width=self.width,
                    color_idx=self.color_idx,
                    branch_id=i,
                )
            )

        return particles


class SeededSplineEmitter(Emitter):
    """Emit particles along seeded spline curves."""

    def __init__(
        self,
        num_splines: int = 5,
        points_per_spline: int = 10,
        width: float = 1.0,
        color_idx: int = 0,
    ):
        """Initialize spline emitter.

        Args:
            num_splines: Number of spline curves
            points_per_spline: Points per spline
            width: Particle width
            color_idx: Color index
        """
        self.num_splines = num_splines
        self.points_per_spline = points_per_spline
        self.width = width
        self.color_idx = color_idx

    def emit(self, rng: RNG, n: int, bounds: tuple[int, int, int, int]) -> list[Particle]:
        """Emit along splines."""
        min_x, min_y, max_x, max_y = bounds
        particles = []

        branch_id = 0
        for spline_idx in range(self.num_splines):
            # Generate control points
            control_points = []
            for _ in range(4):
                control_points.append(
                    [
                        rng.uniform(min_x, max_x),
                        rng.uniform(min_y, max_y),
                    ]
                )

            # Generate points along spline
            for i in range(self.points_per_spline):
                t = i / max(self.points_per_spline - 1, 1)

                # Simple cubic Bezier
                mt = 1.0 - t
                x = (
                    mt**3 * control_points[0][0]
                    + 3 * mt**2 * t * control_points[1][0]
                    + 3 * mt * t**2 * control_points[2][0]
                    + t**3 * control_points[3][0]
                )
                y = (
                    mt**3 * control_points[0][1]
                    + 3 * mt**2 * t * control_points[1][1]
                    + 3 * mt * t**2 * control_points[2][1]
                    + t**3 * control_points[3][1]
                )

                # Compute velocity from spline tangent
                if i < self.points_per_spline - 1:
                    t_next = (i + 1) / max(self.points_per_spline - 1, 1)
                    x_next = (
                        mt**3 * control_points[0][0]
                        + 3 * mt**2 * t * control_points[1][0]
                        + 3 * mt * t**2 * control_points[2][0]
                        + t**3 * control_points[3][0]
                    )
                    y_next = (
                        mt**3 * control_points[0][1]
                        + 3 * mt**2 * t * control_points[1][1]
                        + 3 * mt * t**2 * control_points[2][1]
                        + t**3 * control_points[3][1]
                    )
                    vx = (x_next - x) * 10.0
                    vy = (y_next - y) * 10.0
                else:
                    vx = 0.0
                    vy = 0.0

                particles.append(
                    Particle(
                        pos=np.array([x, y], dtype=np.float32),
                        vel=np.array([vx, vy], dtype=np.float32),
                        age=0.0,
                        width=self.width,
                        color_idx=self.color_idx,
                        branch_id=branch_id,
                    )
                )

            branch_id += 1

        return particles
