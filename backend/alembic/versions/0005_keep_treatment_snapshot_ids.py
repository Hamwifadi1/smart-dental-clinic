"""keep treatment snapshot ids after doctor or service deletion

Revision ID: 0005_keep_treatment_snapshot_ids
Revises: 0004_add_treatment_records
Create Date: 2026-06-19
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0005_keep_treatment_snapshot_ids"
down_revision: str | None = "0004_add_treatment_records"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("treatment_records_doctor_id_fkey", "treatment_records", type_="foreignkey")
    op.drop_constraint("treatment_records_service_id_fkey", "treatment_records", type_="foreignkey")


def downgrade() -> None:
    op.create_foreign_key(
        "treatment_records_doctor_id_fkey",
        "treatment_records",
        "doctors",
        ["doctor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "treatment_records_service_id_fkey",
        "treatment_records",
        "services",
        ["service_id"],
        ["id"],
        ondelete="SET NULL",
    )
