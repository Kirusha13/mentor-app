"""assignment_student_response

Revision ID: c4d5e6f7a8b9
Revises: a3f92c1d8e45
Create Date: 2026-03-19 00:00:00.000000

Изменения:
- assignments: добавлены student_comment (TEXT) и student_files (JSONB)
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'e50c56dc8791'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS student_comment TEXT")
    op.execute("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS student_files JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE assignments DROP COLUMN IF EXISTS student_files")
    op.execute("ALTER TABLE assignments DROP COLUMN IF EXISTS student_comment")
