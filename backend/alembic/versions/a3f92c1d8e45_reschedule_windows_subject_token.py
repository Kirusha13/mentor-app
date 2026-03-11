"""reschedule_windows_subject_token

Revision ID: a3f92c1d8e45
Revises: 19b1dc0f7752
Create Date: 2026-03-10 00:00:00.000000

Изменения:
- conduct_status_enum: добавлены значения reschedule_pending, reschedule_rejected
- tutors: удалён invitation_token
- subjects: добавлены invitation_token, default_rate, color
- lessons: tutor_student_id → NULL, добавлен tutor_id, cost → NULL, добавлен CHECK
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a3f92c1d8e45'
down_revision: Union[str, None] = '19b1dc0f7752'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Новые значения enum
    op.execute("ALTER TYPE conduct_status_enum ADD VALUE IF NOT EXISTS 'reschedule_pending'")
    op.execute("ALTER TYPE conduct_status_enum ADD VALUE IF NOT EXISTS 'reschedule_rejected'")

    # 2. tutors: удаляем invitation_token
    op.execute("DROP INDEX IF EXISTS idx_tutors_invitation_token")
    op.execute("ALTER TABLE tutors DROP COLUMN IF EXISTS invitation_token")

    # 3. subjects: добавляем колонки IF NOT EXISTS
    op.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS invitation_token VARCHAR(255) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS default_rate DECIMAL(10,2) NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS color VARCHAR(7)")
    op.execute("ALTER TABLE subjects ALTER COLUMN invitation_token DROP DEFAULT")
    op.execute("ALTER TABLE subjects ALTER COLUMN default_rate DROP DEFAULT")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_invitation_token ON subjects(invitation_token)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_subjects_invitation_token ON subjects(invitation_token)")

    # 4. lessons: tutor_student_id и cost → nullable
    op.execute("ALTER TABLE lessons ALTER COLUMN tutor_student_id DROP NOT NULL")
    op.execute("ALTER TABLE lessons ALTER COLUMN cost DROP NOT NULL")

    # 5. lessons: добавляем tutor_id IF NOT EXISTS
    op.execute("ALTER TABLE lessons ADD COLUMN IF NOT EXISTS tutor_id BIGINT REFERENCES tutors(id) ON DELETE CASCADE")
    op.execute("CREATE INDEX IF NOT EXISTS idx_lessons_tutor ON lessons(tutor_id)")

    # 6. CHECK — ровно один из tutor_student_id / tutor_id NOT NULL
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'chk_lesson_owner'
            ) THEN
                ALTER TABLE lessons ADD CONSTRAINT chk_lesson_owner CHECK (
                    (tutor_student_id IS NOT NULL AND tutor_id IS NULL) OR
                    (tutor_student_id IS NULL AND tutor_id IS NOT NULL)
                );
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # 6. Удаляем CHECK
    op.drop_constraint('chk_lesson_owner', 'lessons', type_='check')

    # 5. Удаляем tutor_id из lessons
    op.drop_index('idx_lessons_tutor', table_name='lessons')
    op.drop_constraint('fk_lessons_tutor_id', 'lessons', type_='foreignkey')
    op.drop_column('lessons', 'tutor_id')

    # 4. lessons: tutor_student_id и cost обратно NOT NULL
    op.alter_column('lessons', 'tutor_student_id', nullable=False)
    op.alter_column('lessons', 'cost', nullable=False)

    # 3. subjects: удаляем новые колонки
    op.drop_index('idx_subjects_invitation_token', table_name='subjects')
    op.drop_constraint('uq_subjects_invitation_token', 'subjects', type_='unique')
    op.drop_column('subjects', 'color')
    op.drop_column('subjects', 'default_rate')
    op.drop_column('subjects', 'invitation_token')

    # 2. tutors: возвращаем invitation_token
    op.add_column('tutors', sa.Column(
        'invitation_token', sa.VARCHAR(255), nullable=False, server_default=''
    ))
    op.alter_column('tutors', 'invitation_token', server_default=None)
    op.create_unique_constraint('uq_tutors_invitation_token', 'tutors', ['invitation_token'])
    op.create_index('idx_tutors_invitation_token', 'tutors', ['invitation_token'])

    # 1. Значения ENUM в PostgreSQL нельзя удалить — downgrade не поддерживает откат ENUM
    # Для полного отката пересоздать тип вручную
