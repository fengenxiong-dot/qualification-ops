# 钉钉内网部署准备

## 当前接入模式

系统支持三种模式：

- `mock`：模拟通讯录和提醒，用于开发、演示和流程验收。
- `live`：真实钉钉模式；取得企业应用参数和接口权限后启用。
- `off`：关闭钉钉集成，保留纯内网页面。

当前默认使用 `mock`。评分、权重和结果数据与钉钉适配层分离，切换模式不会改变业务数据。

## 内网服务器环境变量

```powershell
$env:CERT_HOST='0.0.0.0'
$env:CERT_PORT='8787'
$env:CERT_BASE_URL='https://qualification.company.local'
$env:CERT_DINGTALK_MODE='live'
$env:CERT_DINGTALK_CORP_ID='由钉钉管理员提供'
$env:CERT_DINGTALK_CLIENT_ID='由钉钉管理员提供'
$env:CERT_DINGTALK_CLIENT_SECRET='仅保存在服务器，不得提交到代码库'
$env:CERT_DINGTALK_AGENT_ID='由钉钉管理员提供'
```

`CERT_BASE_URL` 必须是评委终端可以访问的内网地址。手机端需要连接公司 Wi-Fi、VPN 或零信任网络。

## 公司 IT 需要准备

1. 一台长期运行的公司电脑或虚拟机。
2. 固定内网 IP、内部 DNS 名称和 HTTPS 证书。
3. Windows 防火墙仅向公司内网开放应用端口。
4. 数据目录的每日备份和恢复演练。
5. 钉钉企业内部 H5 应用及其可见范围。
6. 通讯录读取、用户身份、工作通知或待办权限。

## 已预留的数据能力

- 通讯录人员使用钉钉用户 ID 作为唯一标识，姓名只用于显示。
- 评审任务保留专属入口和评委身份绑定。
- 每次提醒记录收件人、内容、链接、状态、错误和时间。
- 模拟模式下可以完整测试“选择评委—推送—打开—提交”流程。

## 正式接入前仍需完成

1. 钉钉免登授权码交换和会话管理。
2. 从钉钉服务端同步可见范围内的通讯录。
3. 调用工作通知或钉钉待办接口。
4. 对回调或 Stream 事件进行签名及重放防护。
5. 根据真实企业权限完成电脑端、手机端和 VPN 联调。

这些步骤必须在取得企业应用参数后进行，开发时不得把 Client Secret 写入前端或数据库展示接口。

## 安装、备份和升级

- 首次安装：运行 `scripts\Install-CertificationOps.ps1`。
- 每日备份任务：管理员运行 `scripts\Register-BackupTask.ps1`。
- 手工备份：运行 `.venv\Scripts\python.exe scripts\backup.py`。
- 恢复备份：停止服务后运行 `.venv\Scripts\python.exe scripts\restore.py <备份文件> --confirm`。
- 构建交付包：开发电脑运行 `scripts\Build-Release.ps1`。
- 升级：先停止服务，再从新版本目录运行 `scripts\Upgrade-CertificationOps.ps1 -InstallDir <安装目录>`。

升级脚本会先备份数据，并保留 `config`、`data`、`backups` 和附件目录；旧程序文件保存在 `rollback\previous`。

## 推荐交付方式：Windows 便携安装包

开发电脑运行 `scripts\Build-Portable-Release.ps1`，会生成 `releases\CertificationOps-Portable-<版本>.zip`。该压缩包已经包含运行时，公司电脑不需要预装 Python。

在公司电脑上的操作顺序：

1. 解压便携安装包，以管理员身份运行 `scripts\Install-CertificationOps.ps1`。
2. 复制 `config\server-config.ps1.example` 为 `config\server-config.ps1`，在公司电脑本地填写真实参数。
3. 将 `CERT_DINGTALK_MODE` 从 `mock` 改为 `live`；`Client Secret` 只保存在这台公司电脑上。
4. 先用内网浏览器验证访问、评分和备份，再配置钉钉应用首页地址及推送权限。
5. 注册每日备份任务，并至少进行一次恢复演练。

便携包不包含开发电脑上的数据库、附件、备份文件或任何真实钉钉密钥。
