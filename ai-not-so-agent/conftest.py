# conftest.py
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

import pytest

pytest_plugins = ["pytest_asyncio"]