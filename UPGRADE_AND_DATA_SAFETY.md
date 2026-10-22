# 系统升级与数据安全说明

本说明适用于已经录入被评价人、评价关系、评委评分或附件材料的服务器。升级的首要原则是：**只更新程序，不覆盖业务数据**。

## 一、必须保留的内容

系统安装目录下的业务数据包括：

```text
data/certification.db
data/submissions/
```

- `certification.db` 保存被评价人、评价关系、权重、评分、定性评价和操作记录。
- `submissions` 保存原始 Excel、图片以及补充附件。
- `backups` 保存系统生成的备份包。

升级时不得删除、替换或用安装包中的空目录覆盖服务器原有的 `data` 和 `backups`。

## 二、升级前准备

1. 选择没有评委正在提交评价的时间窗口。
2. 记录当前版本和服务运行状态。
3. 生成系统备份。
4. 停止服务后，再额外复制整个 `data` 目录。

以下命令假设安装目录为 `/opt/certification-ops`，服务名称为 `certification-ops`。如果实际目录或服务名称不同，应替换成服务器真实值。

```bash
cd /opt/certification-ops
sudo -u certops env PYTHONPATH=/opt/certification-ops/vendor python3 server.py --backup
sudo systemctl stop certification-ops
sudo cp -a data "data-before-update-$(date +%Y%m%d-%H%M%S)"
sudo cp -a /etc/certification-ops.env "/etc/certification-ops.env.before-update-$(date +%Y%m%d-%H%M%S)"
```

如果系统不是通过 systemd 启动，应使用当前实际的停止方式，确认旧进程已经退出后再更新。

## 三、推荐更新方式

不要直接把新版本压缩包解压到正在运行的目录。应先解压到独立临时目录，检查其中不包含 `data` 业务目录，然后只替换程序文件：

```bash
tar -xzf CertificationOps-Update-版本号.tar.gz
cd CertificationOps-Update-版本号
sudo install -m 0644 server.py /opt/certification-ops/server.py
sudo rm -rf /opt/certification-ops/static /opt/certification-ops/vendor
sudo cp -a static /opt/certification-ops/static
sudo cp -a vendor /opt/certification-ops/vendor
sudo chown -R certops:certops /opt/certification-ops
sudo systemctl start certification-ops
```

新版首次启动时会自动检查数据库结构，只增加新版需要的字段，不会重建数据库，也不会清除旧评分。

## 四、升级后必须检查

```bash
sudo systemctl status certification-ops --no-pager
sudo journalctl -u certification-ops -n 100 --no-pager
```

然后在浏览器中逐项确认：

1. 原有被评价人数量是否正确。
2. 原有评价关系和评价人权重是否正确。
3. 已提交的分数和定性评价是否仍可查看。
4. 上传附件是否可以打开。
5. 新增功能是否正常。
6. 系统运维页面的数据库状态是否为正常。

确认无误后，才能重新通知评价人继续打分。

## 五、升级失败时回滚

1. 停止新版本服务。
2. 恢复升级前保存的旧程序文件。
3. 如果数据库迁移或数据校验异常，删除当前 `data` 后，把升级前复制的整个数据目录恢复为 `data`。
4. 恢复原配置文件并重新启动旧版本。

示例：

```bash
sudo systemctl stop certification-ops
sudo mv /opt/certification-ops/data /opt/certification-ops/data-failed-update
sudo cp -a /opt/certification-ops/data-before-update-YYYYMMDD-HHMMSS /opt/certification-ops/data
sudo chown -R certops:certops /opt/certification-ops/data
sudo systemctl start certification-ops
```

执行前必须把示例目录名替换成服务器上真实存在的备份目录名。

## 六、“评委评分导出”更新说明

- 结果看板新增“导出 Excel”，按照一个被评价人一份文件输出评委评分汇总、逐项评分明细及字段计算说明。
- 结果看板新增“一键导出全部 Excel”，一次下载 ZIP，包内按照一个被评价人一份 Excel 输出。
- 导出基本信息与原始申请表保持一致，包括姓名、申报职级、职类和申请时间。
- 增量更新包不包含 `data`、`backups` 和 `config`，不会覆盖已提交评分、附件或服务器配置。

## 七、“评委权重调整”更新说明

- 评委提交评分后，管理员仍可在“评审配置”中修改其汇总权重。
- 系统只更新 `review_assignments` 中的权重，不删除或覆盖 `reviews` 和 `module_scores` 中的原始评价记录。
- 结果看板和 Excel 导出按最新权重动态重算。
- 必须使用“修改”按钮调整权重；不要删除评价关系后重新添加，因为删除评价关系会同时删除该关系下的评分记录。
