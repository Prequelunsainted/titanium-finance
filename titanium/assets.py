"""Imagens da interface, geradas a partir da silhueta do Titanium."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
SILHOUETTE = ASSETS_DIR / "titanium.png"

Color = tuple[int, int, int]


def hex_to_rgb(value: str) -> Color:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


@lru_cache(maxsize=1)
def _silhouette_mask() -> Image.Image:
    """Canal alfa da silhueta, recortado."""
    src = Image.open(SILHOUETTE).convert("RGBA")
    src = src.crop(src.getbbox())
    return src.getchannel("A")


def _tinted(color: str, size: int) -> Image.Image:
    mask = _silhouette_mask()
    scale = size / max(mask.size)
    resized = mask.resize((max(1, round(mask.width * scale)), max(1, round(mask.height * scale))), Image.LANCZOS)
    body = Image.new("RGBA", resized.size, hex_to_rgb(color) + (255,))
    body.putalpha(resized)
    return body


def logo_image(background: str, foreground: str, size: int = 88, radius: int = 24) -> Image.Image:
    """Selo quadrado arredondado com a silhueta no centro (usado na barra lateral)."""
    badge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(badge).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=hex_to_rgb(background))
    figure = _tinted(foreground, round(size * 0.74))
    badge.alpha_composite(figure, ((size - figure.width) // 2, (size - figure.height) // 2 + 2))
    return badge


def icon_image(color: str, size: int = 64) -> Image.Image:
    """Ícone da janela: o selo com o fundo na cor de destaque."""
    return logo_image(color, "#04201B", size=size, radius=round(size * 0.24))
