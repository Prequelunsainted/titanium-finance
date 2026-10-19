"""Gera o executável do Windows em ``dist/Titanus.exe``.

Uso:
    pip install -r requirements.txt pyinstaller
    python build_exe.py
"""

from __future__ import annotations

import os
from pathlib import Path

import PyInstaller.__main__

from titanus import __version__
from titanus.assets import icon_image

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"


def make_icon() -> Path:
    BUILD.mkdir(exist_ok=True)
    path = BUILD / "titanus.ico"
    icon_image("#2DD4BF", size=256).save(
        path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    return path


def main() -> None:
    icon = make_icon()
    PyInstaller.__main__.run(
        [
            str(ROOT / "app.py"),
            "--name=Titanus",
            "--onefile",
            "--windowed",
            "--noconfirm",
            "--clean",
            f"--icon={icon}",
            f"--add-data={ROOT / 'titanus' / 'assets' / 'titanus.png'}{os.pathsep}titanus/assets",
            "--collect-data=customtkinter",
            f"--distpath={ROOT / 'dist'}",
            f"--workpath={BUILD}",
            f"--specpath={BUILD}",
        ]
    )
    print(f"\nTitanus {__version__} pronto em {ROOT / 'dist' / 'Titanus.exe'}")


if __name__ == "__main__":
    main()
