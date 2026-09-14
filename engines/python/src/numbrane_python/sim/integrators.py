"""Numerical integrators for particle simulation."""

from abc import ABC, abstractmethod

import numpy as np

from numbrane_python.fields.vector import VectorField
from numbrane_python.sim.particles import Particle


class Integrator(ABC):
    """Abstract integrator."""

    @abstractmethod
    def step(self, particles: list[Particle], field: VectorField, dt: float, t: float) -> None:
        """Advance particles one time step.

        Args:
            particles: List of particles
            field: Vector field
            dt: Time step
            t: Current time
        """
        pass


class EulerIntegrator(Integrator):
    """Euler integration (first order)."""

    def step(self, particles: list[Particle], field: VectorField, dt: float, t: float) -> None:
        """Euler step."""
        for particle in particles:
            # Sample field at particle position
            vx, vy = field.sample(np.array([particle.pos[0]]), np.array([particle.pos[1]]), t)

            # Update velocity
            particle.vel[0] = float(vx[0])
            particle.vel[1] = float(vy[0])

            # Update position
            particle.pos += particle.vel * dt
            particle.age += dt


class RK2Integrator(Integrator):
    """Runge-Kutta 2nd order integration."""

    def step(self, particles: list[Particle], field: VectorField, dt: float, t: float) -> None:
        """RK2 step."""
        for particle in particles:
            # k1: velocity at current position
            vx1, vy1 = field.sample(np.array([particle.pos[0]]), np.array([particle.pos[1]]), t)
            k1 = np.array([float(vx1[0]), float(vy1[0])])

            # k2: velocity at midpoint
            mid_pos = particle.pos + k1 * (dt / 2.0)
            vx2, vy2 = field.sample(np.array([mid_pos[0]]), np.array([mid_pos[1]]), t + dt / 2.0)
            k2 = np.array([float(vx2[0]), float(vy2[0])])

            # Update velocity and position
            particle.vel = k2
            particle.pos += k2 * dt
            particle.age += dt
