"""Atalho mantido por compatibilidade: ``python app.py``.

O código agora vive no pacote ``titanus``; prefira ``python -m titanus``.
"""

import sys

from titanus.__main__ import main

if __name__ == "__main__":
    sys.exit(main())
