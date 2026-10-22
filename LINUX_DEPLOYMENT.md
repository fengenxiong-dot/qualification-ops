# 任职资格认证系统 Linux 部署说明

> 说明：本文档是旧版基于 systemd 的部署方式。新版已改为独立目录部署，只使用 `start.sh` / `stop.sh`，请优先查看 `LINUX_STANDALONE_UPDATE.md`。

本安装包用于公司内网的 Linux 服务器，包内只包含软件功能和运行依赖，不包含开发电脑上的被评价人、评委、评审配置、评分结果、上传附件等业务数据。

## 一、运行条件

- 64 位 Linux，使用 systemd 管理服务
- Python 3.10 或更高版本
- 建议系统：Ubuntu 22.04/24.04、Debian 12、Rocky Linux 9、AlmaLinux 9
- 服务器与访问人员的电脑处于同一公司内网，且网络策略允许访问 TCP 8787 端口

安装包已经携带 Python 离线依赖，不需要服务器连接互联网执行 `pip install`。

## 二、安装

把 `CertificationOps-Linux-Migration-0.7.0.tar.gz` 复制到 Linux 服务器，然后执行：

```bash
tar -xzf CertificationOps-Linux-Migration-0.7.0.tar.gz
cd CertificationOps-Linux-Migration-0.7.0
sudo bash install.sh
```

默认安装目录为：

```text
/opt/certification-ops
```

安装程序会创建低权限运行账户 `certops`，注册并启动以下 systemd 单元：

- `certification-ops.service`：网站服务，开机自动启动
- `certification-ops-backup.timer`：每天自动备份业务数据

如确实需要更改安装目录，可以在首次安装时传入绝对路径：

```bash
sudo bash install.sh /srv/certification-ops
```

## 三、设置访问地址

先查询服务器的内网 IP：

```bash
hostname -I
```

假设服务器内网 IP 为 `127.0.0.1`，编辑配置文件：

```bash
sudo nano /etc/certification-ops.env
```

把配置调整为：

```text
CERT_HOST=0.0.0.0
CERT_PORT=8787
CERT_BASE_URL=http://127.0.0.1:8787
CERT_DINGTALK_MODE=mock
CERT_MAX_FILE_MB=300
CERT_PARSE_TIMEOUT_SECONDS=60
```

保存后重启服务：

```bash
sudo systemctl restart certification-ops
sudo systemctl status certification-ops --no-pager
```

访问地址：

- 管理端：`http://127.0.0.1:8787/`
- 评价端：`http://127.0.0.1:8787/reviewer`
- 健康检查：`http://127.0.0.1:8787/api/system/health`

请把示例 IP 换成服务器的实际内网 IP。只要服务器使用固定内网 IP，网址就不会变化；建议请公司网管为服务器设置静态 IP 或 DHCP 地址保留。

## 四、开放内网端口

如果启用了 UFW（Ubuntu/Debian），建议只允许公司内网网段访问。以下示例假设公司内网网段是 `192.168.10.0/24`：

```bash
sudo ufw allow from 192.168.10.0/24 to any port 8787 proto tcp
sudo ufw status
```

如果使用 firewalld（Rocky/AlmaLinux）：

```bash
sudo firewall-cmd --permanent --add-port=8787/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

若执行后同事仍无法访问，应让网管检查服务器 VLAN、终端隔离、交换机 ACL 和公司终端防火墙策略。不要把 8787 端口开放到互联网。

## 五、日常操作

查看服务状态：

```bash
sudo systemctl status certification-ops --no-pager
```

查看最近日志：

```bash
sudo journalctl -u certification-ops -n 100 --no-pager
```

实时查看日志：

```bash
sudo journalctl -u certification-ops -f
```

重启、停止和启动：

```bash
sudo systemctl restart certification-ops
sudo systemctl stop certification-ops
sudo systemctl start certification-ops
```

## 六、数据与备份

业务数据保存在：

```text
/opt/certification-ops/data
```

自动备份保存在：

```text
/opt/certification-ops/backups
```

查看自动备份计划：

```bash
sudo systemctl list-timers certification-ops-backup.timer
```

立即执行一次备份：

```bash
sudo systemctl start certification-ops-backup.service
sudo journalctl -u certification-ops-backup.service -n 30 --no-pager
```

升级软件前，请先备份整个 `data` 目录。重新执行新版安装脚本时，安装程序会保留服务器上已有的 `data` 和 `backups` 目录。

## 七、当前版本的安全边界

这是不对接钉钉的公司内网临时版，当前采用简化身份选择流程，不等同于正式账号登录和权限认证。因此：

- 只允许在可信公司内网使用
- 不要映射公网端口，也不要直接发布到互联网
- 管理端地址仅发给管理员
- 服务器操作系统仍应设置登录密码并及时安装安全更新
