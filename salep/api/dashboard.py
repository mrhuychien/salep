# Copyright (c) 2024, Chien and contributors
# For license information, please see license.txt
"""Dashboard 3 cấp (NVBH / NPP / QL kênh) — doc/01 US-06, doc/05.

Dùng frappe.db.sql cho phần tổng hợp (GROUP BY/JOIN nhiều bảng): gọn và tránh
N+1 so với load từng doc qua ORM. Mọi truy vấn tham số hoá (chống SQL injection).
"""

import frappe
from frappe import _

STATE_APPROVED = "Đã duyệt"
STATE_PENDING = "Chờ duyệt"


def _assert_channel_manager():
    if not set(frappe.get_roles()) & {"Channel Manager", "System Manager"}:
        frappe.throw(_("Chỉ Quản lý kênh xem được dashboard này."), frappe.PermissionError)


@frappe.whitelist()
def staff_summary():
    """NVBH: tổng hợp lượt tham gia của CHÍNH MÌNH theo trạng thái + theo chương trình."""
    user = frappe.session.user

    # GROUP BY trạng thái — một query thay vì đếm từng state.
    by_state = frappe.db.sql(
        """
        SELECT workflow_state AS state, COUNT(*) AS cnt
        FROM `tabDisplay Participation`
        WHERE owner = %(user)s
        GROUP BY workflow_state
        """,
        {"user": user},
        as_dict=True,
    )

    by_program = frappe.db.sql(
        """
        SELECT promotion_program AS program, COUNT(*) AS cnt,
               SUM(workflow_state = %(approved)s) AS approved
        FROM `tabDisplay Participation`
        WHERE owner = %(user)s
        GROUP BY promotion_program
        ORDER BY cnt DESC
        """,
        {"user": user, "approved": STATE_APPROVED},
        as_dict=True,
    )

    my_points = frappe.db.count("Display Point", {"owner": user})

    # Thống kê theo ĐIỂM BÁN (distinct display_point) cho 4 ô trang chủ:
    #   tham gia chương trình / chờ duyệt / đã duyệt — một query duy nhất.
    pstats = frappe.db.sql(
        """
        SELECT
          COUNT(DISTINCT display_point) AS participating,
          COUNT(DISTINCT CASE WHEN workflow_state = %(pending)s THEN display_point END) AS pending,
          COUNT(DISTINCT CASE WHEN workflow_state = %(approved)s THEN display_point END) AS approved
        FROM `tabDisplay Participation`
        WHERE owner = %(user)s
        """,
        {"user": user, "pending": STATE_PENDING, "approved": STATE_APPROVED},
        as_dict=True,
    )[0]
    points = {
        "total": my_points,
        "participating": frappe.utils.cint(pstats.participating),
        "pending": frappe.utils.cint(pstats.pending),
        "approved": frappe.utils.cint(pstats.approved),
    }
    return {
        "by_state": by_state,
        "by_program": by_program,
        "total_points": my_points,
        "points": points,
    }


@frappe.whitelist()
def npp_summary(distributor=None):
    """Theo NPP: số điểm + lượt đã duyệt. Role-gated (QL kênh / portal NPP)."""
    _assert_channel_manager()

    conditions = ""
    params = {"approved": STATE_APPROVED}
    if distributor:
        conditions = "WHERE distributor = %(distributor)s"
        params["distributor"] = distributor

    # Tổng hợp lượt theo NPP; JOIN không cần vì distributor đã denormalize trên lượt.
    rows = frappe.db.sql(
        f"""
        SELECT distributor AS npp,
               COUNT(*) AS total_participations,
               SUM(workflow_state = %(approved)s) AS approved_participations,
               COUNT(DISTINCT display_point) AS distinct_points
        FROM `tabDisplay Participation`
        {conditions}
        GROUP BY distributor
        ORDER BY approved_participations DESC
        """,
        params,
        as_dict=True,
    )
    return rows


@frappe.whitelist()
def channel_summary():
    """QL kênh: toàn cảnh — tiến độ & ngân sách từng chương trình, xếp hạng NPP/NV, điểm GPS."""
    _assert_channel_manager()

    # Tiến độ + ngân sách mỗi chương trình:
    #   used = số lượt duyệt × reward_per_point; progress = duyệt / target_points.
    program_progress = frappe.db.sql(
        """
        SELECT p.name AS program, p.program_name, p.status,
               p.target_points, p.budget, p.reward_per_point,
               COUNT(dp.name) AS total,
               SUM(dp.workflow_state = %(approved)s) AS approved,
               SUM(dp.workflow_state = %(approved)s) * IFNULL(p.reward_per_point, 0) AS budget_used
        FROM `tabPromotion Program` p
        LEFT JOIN `tabDisplay Participation` dp ON dp.promotion_program = p.name
        GROUP BY p.name
        ORDER BY p.start_date DESC
        """,
        {"approved": STATE_APPROVED},
        as_dict=True,
    )

    rank_npp = frappe.db.sql(
        """
        SELECT distributor AS npp,
               SUM(workflow_state = %(approved)s) AS approved
        FROM `tabDisplay Participation`
        GROUP BY distributor
        ORDER BY approved DESC
        LIMIT 20
        """,
        {"approved": STATE_APPROVED},
        as_dict=True,
    )

    # Xếp hạng NVBH theo owner (người tạo lượt).
    rank_staff = frappe.db.sql(
        """
        SELECT dp.owner AS staff_user,
               ssp.full_name,
               SUM(dp.workflow_state = %(approved)s) AS approved
        FROM `tabDisplay Participation` dp
        LEFT JOIN `tabSales Staff Profile` ssp ON ssp.user = dp.owner
        GROUP BY dp.owner
        ORDER BY approved DESC
        LIMIT 20
        """,
        {"approved": STATE_APPROVED},
        as_dict=True,
    )

    # Điểm GPS cho bản đồ (chỉ lượt đã duyệt, có toạ độ).
    gps_points = frappe.db.sql(
        """
        SELECT dp.name, dp.display_point, dp.promotion_program, dp.distributor,
               dp.latitude, dp.longitude
        FROM `tabDisplay Participation` dp
        WHERE dp.workflow_state = %(approved)s
          AND dp.latitude IS NOT NULL AND dp.longitude IS NOT NULL
        """,
        {"approved": STATE_APPROVED},
        as_dict=True,
    )

    return {
        "program_progress": program_progress,
        "rank_npp": rank_npp,
        "rank_staff": rank_staff,
        "gps_points": gps_points,
    }
