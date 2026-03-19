"""make tutor phone nullable

Revision ID: e50c56dc8791
Revises: a3f92c1d8e45
Create Date: 2026-03-19 10:52:19.059395
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e50c56dc8791"
down_revision: Union[str, None] = "a3f92c1d8e45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "tutors",
        "phone_number",
        existing_type=sa.VARCHAR(length=15),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "tutors",
        "phone_number",
        existing_type=sa.VARCHAR(length=15),
        nullable=False,
    )