"""add treatment records

Revision ID: 0004_add_treatment_records
Revises: 0003_add_doctor_contact_fields
Create Date: 2026-06-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0004_add_treatment_records"
down_revision: str | None = "0003_add_doctor_contact_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "treatment_records",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("clinic_id", sa.Integer(), nullable=False),
        sa.Column("patient_name", sa.String(length=255), nullable=False),
        sa.Column("patient_phone", sa.String(length=50), nullable=True),
        sa.Column("service_id", sa.Integer(), nullable=True),
        sa.Column("service_name", sa.String(length=255), nullable=False),
        sa.Column("base_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("paid_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("remaining_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("treatment_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("doctor_id", sa.Integer(), nullable=True),
        sa.Column("doctor_name", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["clinic_id"], ["clinics.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["doctor_id"], ["doctors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("treatment_records")
