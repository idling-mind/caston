"""
CastOn — Local-Area-Network Multiplayer Party Game Console Platform.
"""

__version__ = "0.1.0"

from .server import app, create_app, Room, rooms
from .cli import main

__all__ = ["app", "create_app", "Room", "rooms", "main", "__version__"]

