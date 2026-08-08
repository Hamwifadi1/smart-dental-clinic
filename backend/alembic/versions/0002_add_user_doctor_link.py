"""Add optional doctor link to users.

Revision ID: 0002_add_user_doctor_link
Revises: 0001_initial_schema
Create Date: 2026-06-17
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "0002_add_user_doctor_link"
down_revision: str | Sequence[str] | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("doctor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_users_doctor_id_doctors",
        "users",
        "doctors",
        ["doctor_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_doctor_id_doctors", "users", type_="foreignkey")
    op.drop_column("users", "doctor_id")
