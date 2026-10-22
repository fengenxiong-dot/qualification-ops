# 日志与故障诊断说明（0.6.2）

## 日志位置

Windows默认安装目录下：

```text
C:\CertificationOps\logs\
```

- `server.log`：服务启动、HTTP访问、诊断包生成及一般运行事件。
- `error.log`：未处理异常及完整错误堆栈。
- `import.log`：Excel批次开始/结束、单文件解析、超时、失败与跳过原因。

每条日志包含精确到毫秒的时间、日志级别、线程、源码文件名、函数名和代码行号。系统还记录所有请求入口、后端源码抛出的异常原因以及SQLite查询/写入/更新/删除的数据结构和数量。

日志使用UTF-8编码，按自然日轮转，最多保留30个历史文件。日志不记录请求正文、Cookie、访问码、姓名、评分内容、评价文字或材料正文；数据库参数仅记录数量和类型，URL中的长令牌会被替换为 `<redacted-id>`。

## 在管理端下载诊断包

进入“系统运维”，点击“下载诊断日志包”。ZIP只包含：

- 上述程序日志（单个文件最多截取最后5MB）；
- 非敏感运行环境摘要；
- 数据库完整性、数据数量、磁盘空间和备份状态。

诊断包不包含数据库、附件、配置文件、钉钉密钥、访问码、Cookie或请求正文。发送给外部人员前仍建议由管理员快速检查内容。

## 无法打开网页时

直接到服务器查看：

```powershell
Get-Content C:\CertificationOps\logs\error.log -Tail 100
Get-Content C:\CertificationOps\logs\server.log -Tail 100
Get-Content C:\CertificationOps\logs\import.log -Tail 100
```

排查时应同时记录故障发生时间、操作页面、文件名和浏览器提示，但不要通过非授权渠道发送员工材料或生产数据库。
