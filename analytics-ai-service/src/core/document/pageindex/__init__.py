# Vendored from VectifyAI/PageIndex (MIT License).
# See LICENSE in this directory for the original copyright notice.
# Upstream: https://github.com/VectifyAI/PageIndex
#
# The hosted HTTP client (client.py) is intentionally NOT vendored —
# this codebase runs the indexing engine locally, calling LLMs through
# the project's existing LiteLLM configuration.

from .page_index import *  # noqa: F401,F403
from .page_index_md import md_to_tree  # noqa: F401
from .retrieve import (  # noqa: F401
    get_document,
    get_document_structure,
    get_page_content,
)
