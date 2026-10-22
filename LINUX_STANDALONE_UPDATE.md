# 任职资格认证系统独立目录版部署与升级指引

本包把程序与业务数据放在同一个版本目录下，由管理员自行部署和启停，不再依赖 systemd 服务单元。

## 一、IT 提出的两点如何满足

1. 唯一入口是 `start.sh` 和 `stop.sh`。包内不包含 `certification-ops.service`、`certification-ops-backup.timer` 等启动服务；管理员解压后直接运行 `./start.sh` 启动、`./stop.sh` 停止。
2. 数据目录明确为版本目录下的 `data/`，配置为版本目录下的 `server.env`。升级新版本时，把旧版本的 `data/` 和 `server.env` 拷贝到新版本目录后，运行 `./start.sh` 即可。

## 二、目录说明

```text
certification-ops-standalone/
├── server.py
├── start.sh
├── stop.sh
├── server.env.example
├── server.env              # 复制 example 后修改
├── data/                   # 业务数据，升级时整体拷贝
│   ├── certification.db    # 数据库：标准、被评价人、评价关系、权重、评分
│   ├── submissions/        # 在线举证与上传附件
│   └── staging/            # 批量导入临时文件
├── static/
├── vendor/
├── logs/
└── backups/                # 首次执行 --backup 后自动创建
```

## 三、从旧 systemd 版本升级

旧版假设：systemd 服务名为 `certification-ops`，安装目录 `/opt/certification-ops`，数据目录 `/opt/certification-ops/data`，配置文件 `/etc/certification-ops.env`。如果你的实际路径不同，请替换命令中的路径。

### 1. 备份旧数据

建议在没有评委正在保存或提交评分时执行。

```bash
sudo systemctl stop certification-ops
sudo tar -czf /opt/certification-ops-data-$(date +%Y%m%d-%H%M%S).tar.gz -C /opt/certification-ops data
```

备份完成后可先重新启动旧服务继续使用，真正切换前再停一次。

### 2. 校验并解压新包

```bash
cd ~
sha256sum -c CertificationOps-Linux-Standalone-0.8.0.tar.gz.sha256
sudo mkdir -p /opt/certification-ops-standalone
sudo tar -xzf CertificationOps-Linux-Standalone-0.8.0.tar.gz -C /opt/certification-ops-standalone --strip-components=1
```

校验结果应显示 `OK`。确认包内不含业务数据：

```bash
find /opt/certification-ops-standalone -maxdepth 2 -type d -print
```

输出中不应出现 `data`、`backups`（升级包不含历史数据）。

### 3. 拷贝旧数据目录

```bash
sudo systemctl stop certification-ops
sudo cp -a /opt/certification-ops/data /opt/certification-ops-standalone/data
```

这里要拷贝完整的 `data/` 目录，包含 `certification.db`、`submissions/` 和 `staging/`。首次启动新版时程序会自动做数据库结构迁移，不会删除原有评分、评价关系或附件。

### 4. 生成配置

```bash
sudo cp /opt/certification-ops-standalone/server.env.example /opt/certification-ops-standalone/server.env
sudo nano /opt/certification-ops-standalone/server.env
```

对照旧的 `/etc/certification-ops.env`，重点确认：

```text
CERT_HOST=0.0.0.0
CERT_PORT=8787
CERT_BASE_URL=http://127.0.0.1:8787   # 换成服务器实际内网 IP
CERT_DINGTALK_MODE=mock
CERT_MAX_FILE_MB=300
CERT_PARSE_TIMEOUT_SECONDS=60
```

### 5. 设置目录属主并启动

建议继续使用旧安装时创建的 `certops` 账户：

```bash
sudo chown -R certops:certops /opt/certification-ops-standalone
chmod +x /opt/certification-ops-standalone/start.sh /opt/certification-ops-standalone/stop.sh
cd /opt/certification-ops-standalone
sudo -u certops ./start.sh
```

启动后会打印数据目录和访问地址。用健康检查确认：

```bash
curl -fsS http://127.0.0.1:8787/api/system/health
```

### 6. 浏览器验收

1. 原有被评价人数量是否一致。
2. 评价关系、评委、权重是否正确。
3. 已提交的评委评分、逐项评分和定性评价是否能查看。
4. 附件是否可以打开。
5. 资格标准、材料举证、评审配置、结果看板等功能是否正常。

### 7. 确认无误后停用旧服务

```bash
sudo systemctl disable --now certification-ops
sudo systemctl disable --now certification-ops-backup.timer 2>/dev/null || true
```

## 四、日常启停

```bash
cd /opt/certification-ops-standalone
sudo -u certops ./start.sh
sudo -u certops ./stop.sh
```

如果脚本没有执行权限，也可以使用 `bash start.sh` / `bash stop.sh` 代替。

## 五、回滚

如果新版验收不通过，可恢复到升级前状态（会放弃切换期间产生的新数据）：

```bash
cd /opt/certification-ops-standalone
sudo -u certops ./stop.sh

# 恢复升级前的旧数据备份
sudo systemctl stop certification-ops
sudo rm -rf /opt/certification-ops/data
sudo tar -xzf /opt/certification-ops-data-时间戳.tar.gz -C /opt/certification-ops
sudo systemctl enable --now certification-ops
```

请把命令中的时间戳替换为升级前备份文件的实际名称。

## 六、注意事项

- 不要把公网端口映射到该服务，只允许可信公司内网访问。
- 升级前务必保留旧版 `data/` 备份和旧版程序目录，验收通过后再清理。
- 浏览器可能缓存旧页面，看不到新功能时按 `Ctrl+F5` 强制刷新。
