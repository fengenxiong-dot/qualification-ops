# Linux 服务器轻量更新操作指引（0.5.0）

本更新包只替换程序文件，不包含也不会覆盖被评价人、评价关系、权重、评分、定性评价、原始材料、附件或服务器配置。

## 一、更新包新增内容

- 单个被评价人的评委评分 Excel 导出。
- 结果看板“一键导出全部 Excel”，下载 ZIP，每人一份 Excel。
- 导出字段与原始数据一致，不再包含“目前岗位”。
- 更新脚本自动执行业务备份、旧程序备份、服务重启和失败回退。

## 二、上传更新包

把以下文件上传到服务器任意临时目录，例如当前登录用户的家目录：

```text
CertificationOps-Linux-Update-0.5.0.tar.gz
CertificationOps-Linux-Update-0.5.0.tar.gz.sha256
```

不要把压缩包直接解压到 `/opt/certification-ops`。

## 三、校验并解压

```bash
cd ~
sha256sum -c CertificationOps-Linux-Update-0.5.0.tar.gz.sha256
tar -xzf CertificationOps-Linux-Update-0.5.0.tar.gz
cd CertificationOps-Linux-Update-0.5.0
```

校验结果应显示 `OK`。也可以执行以下命令确认更新包没有业务数据目录：

```bash
find . -maxdepth 2 -type d -print
```

输出中不应出现 `data`、`backups` 或 `config`。

## 四、执行更新

建议在没有评委正在保存或提交评分时执行：

```bash
sudo bash update.sh /opt/certification-ops certification-ops
```

如果你的安装目录或 systemd 服务名不同，请把两个参数替换为真实值。脚本会依次：

1. 检查安装目录和数据库。
2. 调用系统自身的备份功能生成业务备份。
3. 停止服务。
4. 把旧程序保存到 `/opt/certification-ops/rollback/program-时间戳/`。
5. 只替换 `server.py`、`static`、`requirements.txt` 和 `VERSION`。
6. 启动服务并检查运行状态；失败时自动恢复旧程序。

## 五、更新后检查

```bash
sudo systemctl status certification-ops --no-pager
sudo journalctl -u certification-ops -n 100 --no-pager
```

然后用浏览器检查：

1. 原有被评价人数量、评价关系和权重是否正确。
2. 已提交分数和定性评价是否仍能查看。
3. 附件是否可以打开。
4. 结果看板是否出现“一键导出全部 Excel”。
5. 单人导出和批量 ZIP 导出是否正常。

浏览器可能缓存旧页面；如果没有看到新按钮，请按 `Ctrl+F5` 强制刷新。

## 六、手动回退

如果更新完成后仍需要回到旧程序，先找到脚本输出的旧程序目录，例如：

```text
/opt/certification-ops/rollback/program-20260810-210000
```

然后执行（替换为真实时间戳）：

```bash
sudo systemctl stop certification-ops
sudo cp -a /opt/certification-ops/rollback/program-20260810-210000/server.py /opt/certification-ops/server.py
sudo rm -rf /opt/certification-ops/static
sudo cp -a /opt/certification-ops/rollback/program-20260810-210000/static /opt/certification-ops/static
sudo systemctl start certification-ops
```

程序更新不修改现有评分数据。除非数据库本身损坏，否则不要恢复旧数据库，以免丢失更新后新提交的评分。
