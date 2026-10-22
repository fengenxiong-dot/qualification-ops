# 源码审查指南（0.6.2）

## 审查范围

- `server.py`：HTTP服务、SQLite数据访问、身份校验、评分计算、Excel解析、导出、日志、备份。
- `static/`：管理端、评价人端页面及样式。
- `scripts/`：Windows安装、更新、备份与发布脚本。
- `tests/`：迁移、评分导出、权重调整、评价关系导入、访问码和诊断包测试。
- `requirements.txt`：Python运行依赖。

## 架构与数据流

系统是单机内网Web应用：浏览器访问Python HTTP服务，业务数据写入SQLite，材料和附件写入`data/submissions`。Excel解析在独立子进程中运行并设有单文件超时，避免单一异常文件阻塞整个批次。

评分流程：评委读取分配任务 → 保存草稿或提交 → 原始逐项评分及定性评价写入数据库 → 看板按当前评价关系权重动态汇总。调整权重不会改写原始评分。

评价人临时入口采用姓名加4至8位数字访问码。访问码使用PBKDF2-HMAC-SHA256、随机盐和120000轮派生后保存；服务端会话有效期12小时，重置访问码会删除原会话。

## 主要数据表

- `submissions`：被评价人及申报信息。
- `modules`、`attachments`、`module_attachments`：行为标准、成长贡献和附件关联。
- `reviewers`、`review_assignments`：评委、评价关系、权重及任务令牌。
- `reviews`、`module_scores`：定性评价、提交状态和逐项评分。
- `reviewer_sessions`：评价人临时会话。
- `audit_logs`、`notification_logs`：业务操作和通知记录。

## 安全审查重点

1. 管理员与评价人的授权边界以及所有管理接口是否强制校验。
2. 临时评价入口、不可猜测任务令牌和12小时会话的适用边界。
3. Excel/ZIP嵌入对象解析是否存在路径穿越、压缩炸弹或资源耗尽风险。
4. 上传大小、解析超时、并发量及SQLite锁竞争。
5. 附件下载路径规范化和越界校验。
6. 删除、迁移、备份、更新失败回滚是否会损坏业务数据。
7. 分数折算、成长贡献直接加分和多评委加权计算。
8. 日志及诊断包是否泄露材料、令牌、密钥或个人信息。
9. `openpyxl`及Python运行环境的供应链风险。

## 当前已知限制

- `mock`模式仅用于本地或受控内网演示，模拟管理员身份切换不构成生产级认证。
- 应用自身不终止TLS；如跨越不可信网络，应由反向代理提供HTTPS和访问控制。
- SQLite适合当前中小规模内网使用，高并发写入场景需要进一步压测或迁移数据库。
- 直接任务链接属于持有者凭证；转发链接会扩大访问范围，正式环境建议进一步绑定登录身份。
- 评价人12小时会话目前主要保护任务列表请求；浏览器刷新后的自动续用体验仍可增强。
- 项目尚未配置自动化依赖漏洞扫描、静态代码扫描和软件物料清单签名。

## 本地复核

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest tests.test_review_export
$env:CERT_HOST='127.0.0.1'
$env:CERT_PORT='8787'
.\.venv\Scripts\python.exe server.py
```

审查时使用自行构造的测试Excel和临时数据库，不要复制生产数据。
