"""add doctor contact fields

Revision ID: 0003_add_doctor_contact_fields
Revises: 0002_add_user_doctor_link
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0003_add_doctor_contact_fields"
down_revision: str | None = "0002_add_user_doctor_link"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("doctors", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("doctors", sa.Column("phone", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("doctors", "phone")
    op.drop_column("doctors", "email")
