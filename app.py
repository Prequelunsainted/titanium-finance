"""Atalho mantido por compatibilidade: ``python app.py``.

O código agora vive no pacote ``titanium``; prefira ``python -m titanium``.
"""

import sys

from titanium.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
