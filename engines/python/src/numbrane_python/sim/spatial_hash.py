"""Spatial hash grid for particle collision/avoidance."""



from numbrane_python.sim.particles import Particle


class SpatialHash:
    """Spatial hash grid for efficient neighbor queries."""

    def __init__(self, cell_size: float = 10.0):
        """Initialize spatial hash.

        Args:
            cell_size: Size of each grid cell
        """
        self.cell_size = cell_size
        self.grid: dict = {}

    def _hash(self, x: float, y: float) -> tuple:
        """Get grid cell coordinates.

        Args:
            x: X coordinate
            y: Y coordinate

        Returns:
            (grid_x, grid_y) tuple
        """
        return (int(x / self.cell_size), int(y / self.cell_size))

    def clear(self) -> None:
        """Clear the grid."""
        self.grid.clear()

    def insert(self, particle: Particle, index: int) -> None:
        """Insert particle into grid.

        Args:
            particle: Particle to insert
            index: Particle index
        """
        cell = self._hash(particle.pos[0], particle.pos[1])
        if cell not in self.grid:
            self.grid[cell] = []
        self.grid[cell].append(index)

    def query(self, x: float, y: float, radius: float) -> set[int]:
        """Query particles within radius.

        Args:
            x: Query X coordinate
            y: Query Y coordinate
            radius: Query radius

        Returns:
            Set of particle indices
        """
        # Get cells to check
        min_cell = self._hash(x - radius, y - radius)
        max_cell = self._hash(x + radius, y + radius)

        results = set()
        for cell_x in range(min_cell[0], max_cell[0] + 1):
            for cell_y in range(min_cell[1], max_cell[1] + 1):
                cell = (cell_x, cell_y)
                if cell in self.grid:
                    results.update(self.grid[cell])

        return results

    def build(self, particles: list[Particle]) -> None:
        """Build grid from particle list.

        Args:
            particles: List of particles
        """
        self.clear()
        for i, particle in enumerate(particles):
            self.insert(particle, i)
