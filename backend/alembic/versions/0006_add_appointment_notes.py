"""add appointment notes

Revision ID: 0006_add_appointment_notes
Revises: 0005_keep_treatment_snapshot_ids
Create Date: 2026-06-19
"""

from alembic import op
import sqlalchemy as sa


revision: str = "0006_add_appointment_notes"
down_revision: str | None = "0005_keep_treatment_snapshot_ids"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column("appointments", sa.Column("notes", sa.Text(), nullable=False, server_default=""))
    op.alter_column("appointments", "notes", server_default=None)


def downgrade() -> None:
    op.drop_column("appointments", "notes")
