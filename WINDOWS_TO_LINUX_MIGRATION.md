# Windows虚拟机迁移到Linux原生服务器操作指引（0.7.0）

本方案迁移业务数据库、被评价人、评委、评价关系、权重、评分、评价意见、上传材料和附件。Windows配置文件不会直接复制到Linux，因为两套系统的服务配置格式不同；Linux访问IP、端口需要单独设置。

## 一、迁移前原则

1. 安排停机窗口，通知评委暂时不要保存或提交。
2. 迁移期间Windows虚拟机作为原始数据源，绝不删除。
3. Linux验收完成并运行稳定后，再决定是否关闭虚拟机。
4. 迁移数据包含员工材料和评分，必须通过公司批准的安全介质传输。

## 二、在Windows虚拟机导出数据

将Linux迁移包中的 `Export-Windows-DataForLinux.ps1` 复制到Windows虚拟机，以管理员身份打开PowerShell，执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\Export-Windows-DataForLinux.ps1 `
  -InstallDir "C:\CertificationOps" `
  -OutputDir "D:\CertificationMigration"
```

如果真实安装目录不是 `C:\CertificationOps`，替换为实际路径。脚本输出：

```text
CertificationOps-Windows-Data-YYYYMMDD-HHMMSS.zip
CertificationOps-Windows-Data-YYYYMMDD-HHMMSS.zip.sha256
```

在Windows核对哈希：

```powershell
$actual=(Get-FileHash .\CertificationOps-Windows-Data-YYYYMMDD-HHMMSS.zip -Algorithm SHA256).Hash.ToLower()
$expected=(Get-Content .\CertificationOps-Windows-Data-YYYYMMDD-HHMMSS.zip.sha256).Split(' ')[0]
$actual -eq $expected
```

结果应为 `True`。

## 三、安装Linux原生程序

把下列文件传到Linux服务器：

- `CertificationOps-Linux-Migration-0.7.0.tar.gz`
- 对应 `.sha256`
- Windows导出的业务数据ZIP及对应 `.sha256`

校验Linux程序包：

```bash
sha256sum -c CertificationOps-Linux-Migration-0.7.0.tar.gz.sha256
```

解压、安装：

```bash
tar -xzf CertificationOps-Linux-Migration-0.7.0.tar.gz
cd CertificationOps-Linux-Migration-0.7.0
sudo bash install.sh
```

需要Python 3.10以上、systemd及unzip。包内携带Python离线依赖，不要求互联网安装pip包。

## 四、导入Windows业务数据

先核对数据ZIP哈希：

```bash
sha256sum -c CertificationOps-Windows-Data-YYYYMMDD-HHMMSS.zip.sha256
```

然后在解压后的Linux迁移包目录执行：

```bash
sudo bash migrate-from-windows.sh \
  /数据包所在路径/CertificationOps-Windows-Data-YYYYMMDD-HHMMSS.zip \
  /opt/certification-ops
```

脚本会停止服务、保存Linux现有数据、验证ZIP路径、调用程序内置恢复逻辑、修复权限、启动服务、检查SQLite完整性并打印各类数据数量。任一步失败会恢复Linux迁移前数据。

## 五、设置Linux访问地址

查询内网IP：

```bash
hostname -I
```

编辑：

```bash
sudo nano /etc/certification-ops.env
```

示例：

```text
CERT_HOST=0.0.0.0
CERT_PORT=8787
CERT_BASE_URL=http://127.0.0.1:8787
CERT_DINGTALK_MODE=mock
CERT_MAX_FILE_MB=300
CERT_PARSE_TIMEOUT_SECONDS=60
```

重启：

```bash
sudo systemctl restart certification-ops
sudo systemctl status certification-ops --no-pager
```

## 六、验收清单

逐项对比Windows旧系统和Linux新系统：

1. 被评价人数。
2. 评委人数、个人访问码状态。
3. 每个被评价人的评价关系与权重。
4. 未开始、评价中、已完成数量。
5. 已提交评分、定性评价和加权结果。
6. 原始Excel、图片及补充附件能否打开。
7. 单人和全部Excel导出。
8. 系统运维、运行日志及诊断包下载。

至少保留Windows虚拟机一段观察期。Linux数据验证完成前，不要在Windows和Linux两边同时继续录入，否则两边数据会分叉，系统不会自动合并。

## 七、回滚

迁移脚本会保留：

```text
/opt/certification-ops/migration-rollback-时间戳/
```

如果验收失败，可以停止Linux服务并恢复该目录中的 `data`。Windows原系统始终未被修改或删除，可直接重新启动继续使用。
