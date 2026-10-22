# Windows 轻量增量更新指引（0.6.2）

本更新包适用于通过 `CertificationOps-Portable-0.4.0-base` 安装、并已更新到任意 0.5.x 版本的 Windows 系统。

它只更新程序功能，不包含也不会覆盖现有被评价人、评委、评价关系、权重、评分、评价意见、材料附件和服务器配置。

## 一、0.6.2 更新内容

- 请求、异常和数据库访问日志覆盖增强。
- 每条日志增加毫秒时间、源码文件、函数名和代码行号。
- 对身份信息、访问码、令牌、评分及材料正文实行脱敏或只记录数据结构。

同时包含0.6.1的以下功能：

- 增加服务运行日志、错误日志和Excel解析日志，自动按日轮转并保留30份。
- 系统运维页面支持下载不含数据库、附件、配置和访问码的诊断日志包。

同时包含0.6.0的以下功能：

- 支持评价关系 Excel 模板下载、批量上传与识别。
- 新增评委管理：添加、删除、设置或重置个人访问码。
- 评价人使用姓名和个人访问码验证，只能查看本人评价任务。
- 结果看板增加姓名、认证级别和评价进展筛选。
- 修改权重后保持页面位置，并继续保留评委原始评分。
- 评委名单和被评价人名单默认折叠，批量导入与手动配置合并展示。

完整版本差异请查看更新包中的 `CHANGELOG.zh.md`。

## 二、更新前准备

1. 选择没有评委正在保存或提交评价的时间。
2. 把更新 ZIP 和 `.sha256` 文件复制到部署系统的 Windows 虚拟机。
3. 不要直接解压到 `C:\CertificationOps`，先解压到独立临时目录。
4. 条件允许时，先为虚拟机创建快照。

## 三、校验更新包

在 ZIP 所在目录打开 PowerShell：

```powershell
$actual = (Get-FileHash .\CertificationOps-Windows-Update-0.6.2.zip -Algorithm SHA256).Hash.ToLower()
$expected = (Get-Content .\CertificationOps-Windows-Update-0.6.2.zip.sha256).Split(' ')[0]
$actual -eq $expected
```

输出应为 `True`。

## 四、解压并更新

以管理员身份打开 PowerShell，执行：

```powershell
Expand-Archive .\CertificationOps-Windows-Update-0.6.2.zip -DestinationPath . -Force
cd .\CertificationOps-Windows-Update-0.6.2
powershell -ExecutionPolicy Bypass -File .\Update-CertificationOps-Windows.ps1 -InstallDir "C:\CertificationOps"
```

如果原系统不在 `C:\CertificationOps`，请把 `InstallDir` 换成真实安装目录。

更新脚本会自动：

1. 使用旧程序备份业务数据库和附件。
2. 停止计划任务及正在运行的服务。
3. 把旧程序保存到 `C:\CertificationOps\rollback\program-时间戳`。
4. 仅替换程序、运行库、静态页面和版本文件。
5. 保留 `data`、`config`、`backups`、`logs` 和全部附件。
6. 重新启动并检查服务；如果启动失败，自动恢复旧程序。

如果计划任务名称不是 `CertificationOpsServer`：

```powershell
powershell -ExecutionPolicy Bypass -File .\Update-CertificationOps-Windows.ps1 `
  -InstallDir "C:\CertificationOps" `
  -TaskName "实际的计划任务名称"
```

## 五、更新后检查

1. 打开原来的系统网址，按 `Ctrl+F5` 强制刷新。
2. 检查被评价人、评价关系、权重和历史评分是否完整。
3. 打开“评审配置”，确认评委管理和评价关系批量导入入口正常。
4. 为需要使用临时评价入口的评委设置个人访问码。
5. 打开结果看板，检查筛选、单人导出和批量导出。
6. 打开安装目录中的 `VERSION`，应显示 `0.6.2`。

## 六、重要提醒

- 不要把更新包直接覆盖解压到安装目录。
- 不要删除或替换安装目录中的 `data` 和 `config`。
- 本包是 Windows 更新包，不能用于 Linux 原生部署。
- 第一次启动可能稍慢，等待十几秒后再刷新页面。
- 新增的访问码字段由程序自动迁移，不会删除或改写原有评分数据。
