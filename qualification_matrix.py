"""Versioned qualification matrices; no database or web dependencies."""
import copy
import uuid

NO_ADDITION = "〔无新增要求〕"
GRADE_NAMES = ["一级", "二级", "三级", "四级", "五级", "六级", "七级"]
TIERS = [
    {"name": "初做者", "min": 1, "max": 2, "definition": "具备本专业单模块的基础知识技能，对体系有局部了解，能在他人指导下开展单一、局部工作"},
    {"name": "专业级", "min": 3, "max": 4, "definition": "具备本专业单模块知识技能，能发现本专业一般问题，能独立完成本专业某一模块程序化工作，能为初做者提供有效指导"},
    {"name": "骨干级", "min": 5, "max": 6, "definition": "具备多模块知识技能，能发现并解决本专业复杂问题，能主导优化现有程序方法，在二级部门内具备影响力，能为有经验者提供有效指导"},
    {"name": "专家级", "min": 7, "max": 9, "definition": "具备本专业大多数模块知识技能，能把握本专业发展趋势，解决本专业重大且复杂的问题，能制定本专业发展规划，指导本专业子系统变革，在中心具备影响力，能为骨干提供有效指导"},
    {"name": "教授级", "min": 10, "max": 12, "definition": ""},
]


def default_matrix():
    return {"schemaVersion": 1, "dimensions": [
        {"id": key, "name": name, "basis": basis, "columnStyle": "name", "description": "", "reviewType": review_type, "rows": []}
        for key, name, basis, review_type in [
            ("basic", "基本条件", "grade", "reference"),
            ("knowledge", "知识标准", "tier", "reference"),
            ("skills", "技能标准", "tier", "reference"),
            ("competencies", "能力素质标准", "tier", "reference"),
            ("standard", "行为标准", "grade", "standard"),
            ("bonus", "专业成果&团队成长贡献", "grade", "bonus"),
        ]]}


def text(value, limit=30000):
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError("标准内容必须为文本且不能超过长度限制")
    return value.strip()


def normalize_matrix(value, *, archive=False, template=False):
    if not isinstance(value, dict) or value.get("schemaVersion", 1) != 1:
        raise ValueError("矩阵格式或版本无效")
    dimensions = value.get("dimensions")
    if not isinstance(dimensions, list) or not 1 <= len(dimensions) <= 30:
        raise ValueError("请配置 1 至 30 个认证维度")
    result = {"schemaVersion": 1, "dimensions": []}
    ids, names = set(), set()
    for dimension in dimensions:
        if not isinstance(dimension, dict):
            raise ValueError("维度格式无效")
        did = text(dimension.get("id"), 100) or uuid.uuid4().hex
        name = text(dimension.get("name"), 100)
        basis, review_type = dimension.get("basis"), dimension.get("reviewType", "reference")
        column_style = text(dimension.get("columnStyle"), 20) or "name"
        if not name or name in names or did in ids:
            raise ValueError("维度名称不能为空或重复，标识必须唯一")
        if basis not in ("grade", "tier") or review_type not in ("reference", "standard", "bonus"):
            raise ValueError("维度编写口径或评审用途无效")
        if column_style not in ("name", "number") or (column_style == "number" and basis != "grade"):
            raise ValueError("维度列口径只能是职级名称或等级号")
        ids.add(did)
        names.add(name)
        rows = dimension.get("rows", [])
        if not isinstance(rows, list) or len(rows) > 100:
            raise ValueError("每个维度最多支持 100 个子维度")
        if archive and not rows:
            raise ValueError(f"{name}：存档前请添加子维度，或移除该维度")
        output = {"id": did, "name": name, "basis": basis, "columnStyle": column_style, "reviewType": review_type,
                  "description": text(dimension.get("description"), 2000), "rows": []}
        row_ids, row_names = set(), set()
        keys = [str(i) for i in range(1, 8 if basis == "grade" else 5)]
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("子维度格式无效")
            rid, rname = text(row.get("id"), 100) or uuid.uuid4().hex, text(row.get("name"), 200)
            if not rname or rname in row_names or rid in row_ids:
                raise ValueError(f"{name}：子维度名称不能为空或重复，标识必须唯一")
            row_ids.add(rid)
            row_names.add(rname)
            cells = row.get("cells", {})
            if not isinstance(cells, dict) or any(k not in keys for k in cells):
                raise ValueError("矩阵列超出当前开发范围（职级 1—7 或层级 1—4）")
            cells = {k: "" if template else text(cells.get(k)) for k in keys}
            # 定稿不要求写满所有等级：留空表示该等级标准待补充，引用时按“待补充”提示。
            output["rows"].append({"id": rid, "name": rname, "cells": cells})
        result["dimensions"].append(output)
    return result


def grade_number(value):
    if isinstance(value, bool):
        raise ValueError("请选择一级至七级")
    try:
        number = int(value)
    except (ValueError, TypeError):
        raise ValueError("请选择一级至七级")
    if str(number) != str(value) or not 1 <= number <= 7:
        raise ValueError("当前仅开放一级至七级")
    return number


def resolve_requirements(matrix, grade):
    grade = grade_number(grade)
    tier_index = next(i for i, tier in enumerate(TIERS) if tier["min"] <= grade <= tier["max"])
    output = []
    for dimension in matrix["dimensions"]:
        limit = grade if dimension["basis"] == "grade" else tier_index + 1
        item = {k: copy.deepcopy(v) for k, v in dimension.items() if k != "rows"}
        item["rows"] = []
        for row in dimension["rows"]:
            parts = [{"level": str(i), "text": row["cells"].get(str(i), "")} for i in range(1, limit + 1)]
            inherited = [part for part in parts if part["text"] and part["text"] != NO_ADDITION]
            item["rows"].append({"id": row["id"], "name": row["name"], "requirements": inherited,
                                "text": "\n".join(part["text"] for part in inherited),
                                "pending": any(not part["text"] for part in parts)})
        output.append(item)
    return output
