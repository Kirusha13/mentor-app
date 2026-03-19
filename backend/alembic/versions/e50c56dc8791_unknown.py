"""unknown (stub for revision applied to DB but missing locally)

Revision ID: e50c56dc8791
Revises: a3f92c1d8e45
Create Date: 2026-01-01 00:00:00.000000
"""
from typing import Sequence, Union

revision: str = 'e50c56dc8791'
down_revision: Union[str, None] = 'a3f92c1d8e45'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass  # уже применено в БД


def downgrade() -> None:
    pass
