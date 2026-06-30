# Copyright (c) 2024, Chien and contributors
"""[post_model_sync] Cập nhật lại workflow (thêm System Manager vào transitions)
cho site đã cài trước đó. Idempotent."""

from salep.patches.v0_0_1 import setup_workflow


def execute():
    setup_workflow.execute()
