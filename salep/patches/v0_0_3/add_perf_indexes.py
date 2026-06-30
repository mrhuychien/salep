# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Bổ sung index hiệu năng (owner/workflow_state, program,
distributor) cho site đã cài. Idempotent — re-run add_db_indexes."""

from salep.patches.v0_0_1 import add_db_indexes


def execute():
    add_db_indexes.execute()
