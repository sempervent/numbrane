"""Canvas for rendering."""


import numpy as np


class Canvas:
    """Rendering canvas with layers."""

    def __init__(self, width: int, height: int, num_channels: int = 3):
        """Initialize canvas.

        Args:
            width: Canvas width
            height: Canvas height
            num_channels: Number of color channels (3 for RGB, 4 for RGBA)
        """
        self.width = width
        self.height = height
        self.num_channels = num_channels
        self.layers = {}
        self.composite = np.zeros((height, width, num_channels), dtype=np.uint8)

    def create_layer(self, name: str, clear: bool = True) -> np.ndarray:
        """Create or get a layer.

        Args:
            name: Layer name
            clear: Whether to clear existing layer

        Returns:
            Layer array
        """
        if name not in self.layers or clear:
            self.layers[name] = np.zeros(
                (self.height, self.width, self.num_channels), dtype=np.uint8
            )
        return self.layers[name]

    def get_layer(self, name: str) -> np.ndarray | None:
        """Get a layer by name.

        Args:
            name: Layer name

        Returns:
            Layer array or None
        """
        return self.layers.get(name)

    def composite_layers(
        self, layer_order: list | None = None, alpha_blend: bool = True
    ) -> np.ndarray:
        """Composite all layers into final image.

        Args:
            layer_order: Order of layers (None = all layers)
            alpha_blend: Whether to use alpha blending

        Returns:
            Composite image
        """
        self.composite.fill(0)

        if layer_order is None:
            layer_order = list(self.layers.keys())

        for layer_name in layer_order:
            if layer_name in self.layers:
                layer = self.layers[layer_name]
                if alpha_blend and self.num_channels == 4:
                    # Alpha blend
                    alpha = layer[:, :, 3:4] / 255.0
                    self.composite = (
                        self.composite * (1.0 - alpha) + layer[:, :, :3] * alpha
                    ).astype(np.uint8)
                else:
                    # Overwrite
                    self.composite = np.maximum(self.composite, layer[:, :, : self.num_channels])

        return self.composite

    def get_image(self) -> np.ndarray:
        """Get the final composite image.

        Returns:
            Image array
        """
        return self.composite_layers()
