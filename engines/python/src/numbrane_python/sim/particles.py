"""Particle system."""

from dataclasses import dataclass

import numpy as np


@dataclass
class Particle:
    """Particle in simulation."""

    pos: np.ndarray  # [x, y]
    vel: np.ndarray  # [vx, vy]
    age: float
    width: float
    color_idx: int
    branch_id: int
    parent_id: int | None = None

    def copy(self) -> "Particle":
        """Create a copy of this particle."""
        return Particle(
            pos=self.pos.copy(),
            vel=self.vel.copy(),
            age=self.age,
            width=self.width,
            color_idx=self.color_idx,
            branch_id=self.branch_id,
            parent_id=self.parent_id,
        )


class ParticleSystem:
    """System for managing particles."""

    def __init__(self):
        """Initialize empty particle system."""
        self.particles: list[Particle] = []
        self.next_branch_id = 0

    def add(self, particle: Particle) -> None:
        """Add a particle.

        Args:
            particle: Particle to add
        """
        self.particles.append(particle)

    def remove(self, index: int) -> None:
        """Remove particle by index.

        Args:
            index: Particle index
        """
        if 0 <= index < len(self.particles):
            self.particles.pop(index)

    def remove_dead(self, max_age: float | None = None) -> None:
        """Remove dead particles.

        Args:
            max_age: Maximum age (None = no limit)
        """
        if max_age is None:
            return

        self.particles = [p for p in self.particles if p.age < max_age]

    def get_new_branch_id(self) -> int:
        """Get a new unique branch ID.

        Returns:
            New branch ID
        """
        branch_id = self.next_branch_id
        self.next_branch_id += 1
        return branch_id

    def get_branch_particles(self, branch_id: int) -> list[Particle]:
        """Get all particles in a branch.

        Args:
            branch_id: Branch ID

        Returns:
            List of particles in branch
        """
        return [p for p in self.particles if p.branch_id == branch_id]

    def clear(self) -> None:
        """Clear all particles."""
        self.particles.clear()
        self.next_branch_id = 0
