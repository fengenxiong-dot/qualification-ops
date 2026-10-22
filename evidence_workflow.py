"""Assigned evidence tasks, code sessions and administrator confirmation workflow."""
import hashlib
import json
import secrets
import threading
import time
import uuid
from pathlib import Path

APP = None  # Bound by server; avoids a second server instance when run as __main__.
EDITABLE = ('填报中', '退回修改')
EXTENSIONS = {'.png','.jpg','.jpeg','.gif','.webp','.bmp','.tif','.tiff','.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.csv','.rtf','.odt','.ods','.odp','.zip','.7z'}
_attempts = {}
_lock = threading.Lock()

def init_storage(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS evidence_tasks (
        submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
        code_hash TEXT UNIQUE NOT NULL, instructions TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL DEFAULT 0, finalized_at TEXT, created_by TEXT, created_at TEXT NOT NULL)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS evidence_sessions (
        token_hash TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES evidence_tasks(submission_id) ON DELETE CASCADE,
        expires_at REAL NOT NULL)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS evidence_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id TEXT NOT NULL REFERENCES evidence_tasks(submission_id) ON DELETE CASCADE,
        action TEXT NOT NULL, note TEXT NOT NULL, actor_name TEXT, created_at TEXT NOT NULL, snapshot_json TEXT NOT NULL)''')

def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()

def task(conn, sid):
    return conn.execute('SELECT * FROM evidence_tasks WHERE submission_id=?',(sid,)).fetchone()

def insert_task(conn, sid, config):
    conn.execute('INSERT INTO evidence_tasks(submission_id,code_hash,instructions,created_by,created_at) VALUES(?,?,?,?,?)',
                 (sid,config['codeHash'],config['instructions'],config['createdBy'],APP.now_text()))

def event(conn, sid, action, note, actor):
    snapshot={'modules':[dict(r) for r in conn.execute('SELECT id,module_name,evidence,self_score FROM modules WHERE submission_id=? ORDER BY sort_order',(sid,))],
              'attachments':[dict(r) for r in conn.execute('SELECT id,material_name,uploaded_file_path,link_url FROM attachments WHERE submission_id=? ORDER BY sort_order',(sid,))]}
    snapshot['attachmentLinks']=[dict(r) for r in conn.execute('''SELECT ma.module_id,ma.attachment_id FROM module_attachments ma
        JOIN attachments a ON a.id=ma.attachment_id WHERE a.submission_id=? ORDER BY ma.attachment_id,ma.module_id''',(sid,))]
    conn.execute('INSERT INTO evidence_events(submission_id,action,note,actor_name,created_at,snapshot_json) VALUES(?,?,?,?,?,?)',
                 (sid,action,note,actor.get('name',''),APP.now_text(),json.dumps(snapshot,ensure_ascii=False)))
    conn.execute('UPDATE evidence_tasks SET revision=revision+1 WHERE submission_id=?',(sid,))

def info(conn, sid):
    row=task(conn,sid)
    if not row:return None
    events=[dict(r) for r in conn.execute('SELECT id,action,note,actor_name,created_at FROM evidence_events WHERE submission_id=? ORDER BY id DESC',(sid,))]
    linked=conn.execute('SELECT c.person_id,c.source_json,p.employee_no FROM personnel_certifications c JOIN personnel p ON p.id=c.person_id WHERE c.submission_id=?',(sid,)).fetchone()
    identity={'personId':linked['person_id'],'employeeNo':linked['employee_no'],'currentLevel':json.loads(linked['source_json']).get('currentLevel','')} if linked else None
    return {'instructions':row['instructions'],'revision':row['revision'],'finalizedAt':row['finalized_at'],'events':events,'changes':changes_since_return(conn,sid),'identity':identity}

def changes_since_return(conn, sid):
    baseline=conn.execute("SELECT id,created_at,snapshot_json FROM evidence_events WHERE submission_id=? AND action='退回修改' ORDER BY id DESC LIMIT 1",(sid,)).fetchone()
    if not baseline:return None
    snapshot=json.loads(baseline['snapshot_json'])
    old_modules={m['id']:m for m in snapshot.get('modules',[])}
    changed=[]
    for row in conn.execute('SELECT id,evaluation_item,module_name,evidence,self_score FROM modules WHERE submission_id=? ORDER BY sort_order',(sid,)):
        old=old_modules.get(row['id'],{})
        fields=[]
        for key,label in [('evidence','举证说明'),('self_score','自评说明')]:
            before=old.get(key) or '';after=row[key] or ''
            if before!=after:fields.append({'field':key,'label':label,'before':before,'after':after})
        if fields:changed.append({'id':row['id'],'dimension':row['evaluation_item'],'name':row['module_name'],'fields':fields})
    previous={a['id']:a for a in snapshot.get('attachments',[])}
    current={a['id']:dict(a) for a in conn.execute('SELECT id,material_name FROM attachments WHERE submission_id=?',(sid,))}
    attachments=[{'action':'新增附件','name':a['material_name']} for key,a in current.items() if key not in previous]
    attachments += [{'action':'移除附件','name':a.get('material_name','附件')} for key,a in previous.items() if key not in current]
    if 'attachmentLinks' in snapshot:
        old_links={(r['attachment_id'],r['module_id']) for r in snapshot['attachmentLinks']}
        new_links={(r['attachment_id'],r['module_id']) for r in conn.execute('''SELECT ma.attachment_id,ma.module_id FROM module_attachments ma
            JOIN attachments a ON a.id=ma.attachment_id WHERE a.submission_id=?''',(sid,))}
        for aid in sorted(set(previous)&set(current)):
            if {m for a,m in old_links if a==aid}!={m for a,m in new_links if a==aid}:
                attachments.append({'action':'调整附件归属','name':current[aid]['material_name']})
    status=conn.execute('SELECT status FROM submissions WHERE id=?',(sid,)).fetchone()['status']
    return {'baselineAt':baseline['created_at'],'pendingResubmission':status in EDITABLE,'modules':changed,'attachments':attachments}

def create(payload, admin):
    name=APP.clean(payload.get('name'))
    if not name or len(name)>100:raise ValueError('请填写举证人姓名（最多100字）')
    employee_no=APP.clean(payload.get('employeeNo')).upper()
    current_level=APP.clean(payload.get('currentLevel'))
    if not employee_no or len(employee_no)>80:raise ValueError('请填写工号（最多80字）')
    if not current_level or len(current_level)>80:raise ValueError('请填写当前职级（最多80字）')
    standard=APP.qualification_standard_detail(APP.clean(payload.get('standardId')),published_only=True)
    if not standard or not standard['standard'].get('matrix'):raise ValueError('请选择已存档的分级矩阵标准；旧格式标准请先迭代为矩阵')
    grade=APP.grade_number(payload.get('grade'))
    instructions=APP.clean(payload.get('instructions'))
    if len(instructions)>10000:raise ValueError('填写指引不能超过10000字')
    code=secrets.token_urlsafe(12)
    owner={'userId':'evidence:'+uuid.uuid4().hex,'name':name,'role':'举证人'}
    result=APP.create_online_application(standard['standard']['id'],owner,grade,
        task_config={'codeHash':digest(code),'instructions':instructions,'createdBy':admin.get('userId'),'createdByName':admin.get('name'),
                     'employeeNo':employee_no,'currentLevel':current_level})
    return {'submission':result['submission'],'code':code,'portalPath':'/evidence'}

def list_tasks():
    with APP.db() as conn:
        return [dict(r) for r in conn.execute('''SELECT s.id,s.name,s.category,s.level,s.status,s.applied_at,s.submitted_at,
            t.revision,t.finalized_at,t.created_at,t.instructions,p.employee_no,
            json_extract(c.source_json,'$.currentLevel') current_level
            FROM evidence_tasks t JOIN submissions s ON s.id=t.submission_id
            LEFT JOIN personnel_certifications c ON c.submission_id=s.id LEFT JOIN personnel p ON p.id=c.person_id
            ORDER BY t.created_at DESC''')]

def login(code, client='local'):
    code=APP.clean(code)
    now=time.time()
    with _lock:
        if len(_attempts)>10000:_attempts.clear()
        recent=[t for t in _attempts.get(client,[]) if now-t<60]
        if len(recent)>=10:raise ValueError('尝试过于频繁，请一分钟后重试')
        _attempts[client]=recent+[now]
    if not code or len(code)>100:raise ValueError('举证码无效或已重置')
    with APP.db() as conn:
        row=conn.execute('SELECT submission_id FROM evidence_tasks WHERE code_hash=?',(digest(code),)).fetchone()
        if not row:raise ValueError('举证码无效或已重置')
        token=secrets.token_urlsafe(32)
        conn.execute('DELETE FROM evidence_sessions WHERE expires_at<?',(now,))
        conn.execute('INSERT INTO evidence_sessions VALUES(?,?,?)',(digest(token),row['submission_id'],now+8*3600))
    return {'sessionToken':token,'submissionId':row['submission_id']}

def session_actor(token):
    if not token:return None
    with APP.db() as conn:
        row=conn.execute('''SELECT s.id,s.name,s.owner_external_user_id FROM evidence_sessions e JOIN submissions s ON s.id=e.submission_id
            WHERE e.token_hash=? AND e.expires_at>?''',(digest(token),time.time())).fetchone()
    return {'userId':row['owner_external_user_id'],'name':row['name'],'role':'举证人','evidenceId':row['id']} if row else None

def logout(token):
    with APP.db() as conn:conn.execute('DELETE FROM evidence_sessions WHERE token_hash=?',(digest(token),))

def reset_code(sid, admin):
    code=secrets.token_urlsafe(12)
    with APP.db() as conn:
        if not task(conn,sid):raise ValueError('举证任务不存在')
        conn.execute('UPDATE evidence_tasks SET code_hash=? WHERE submission_id=?',(digest(code),sid))
        conn.execute('DELETE FROM evidence_sessions WHERE submission_id=?',(sid,))
        event(conn,sid,'重置举证码','原举证码及登录会话已失效',admin)
    return {'code':code,'portalPath':'/evidence'}

def ensure_finalized(conn, sid):
    row=task(conn,sid)
    if row and not row['finalized_at']:raise ValueError('在线举证须经管理员定稿后才能分配或进行评审')

def decide(sid, payload, admin):
    action=payload.get('action');note=APP.clean(payload.get('note'))
    if action not in ('feedback','return','finalize'):raise ValueError('无效处理方式')
    if action in ('feedback','return') and not note:raise ValueError('请填写反馈或退回意见')
    if len(note)>10000:raise ValueError('反馈不能超过10000字')
    with APP.db() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=task(conn,sid)
        if not row:raise ValueError('举证任务不存在')
        if payload.get('revision')!=row['revision']:raise ValueError('材料已更新，请重新打开后处理')
        status=conn.execute('SELECT status FROM submissions WHERE id=?',(sid,)).fetchone()['status']
        if action!='feedback' and status!='待管理员确认':raise ValueError('仅可处理待管理员确认的材料')
        if row['finalized_at'] and action!='feedback':raise ValueError('材料已定稿，不能再退回')
        if action=='return':conn.execute("UPDATE submissions SET status='退回修改' WHERE id=?",(sid,))
        if action=='finalize':
            APP.validate_application_attachment_links(conn,sid)
            conn.execute('UPDATE evidence_tasks SET finalized_at=? WHERE submission_id=?',(APP.now_text(),sid))
            conn.execute("UPDATE submissions SET status='已定稿' WHERE id=?",(sid,))
        event(conn,sid,{'feedback':'管理员反馈','return':'退回修改','finalize':'材料定稿'}[action],note,admin)
    return APP.submission_detail(sid)

def validate_attachment(filename,length):
    if Path(filename).suffix.lower() not in EXTENSIONS:raise ValueError('请上传图片、PDF、Office 文档、文本或 ZIP/7z 压缩包，不支持可执行文件或网页')
    if length<=0 or length>APP.MAX_BODY:raise ValueError(f'附件大小须在1字节至{APP.MAX_FILE_MB}MB之间')

def media_access(sid, actor, review_token=''):
    if actor and (actor.get('role')=='管理员' or actor.get('evidenceId')==sid):return True
    if review_token:
        with APP.db() as conn:
            return bool(conn.execute('SELECT 1 FROM review_assignments WHERE submission_id=? AND token=?',(sid,review_token)).fetchone())
    return False

def http_get(handler,path):
    if path=='/api/admin/evidence-tasks':
        if handler.require_admin():handler.json_response({'items':list_tasks()})
        return True
    if path=='/api/evidence/me':
        actor=session_actor(handler.headers.get('X-Evidence-Session',''))
        handler.json_response({'user':actor},200 if actor else 401);return True
    if path.startswith('/api/evidence/attachments/'):
        aid=path.rsplit('/',1)[-1];actor=session_actor(handler.headers.get('X-Evidence-Session',''))
        with APP.db() as conn:row=conn.execute('SELECT submission_id,uploaded_file_path,storage_path FROM attachments WHERE id=?',(aid,)).fetchone()
        if not row or not actor or actor['evidenceId']!=row['submission_id']:
            handler.json_response({'error':'无权访问附件'},403);return True
        target=(APP.DATA_DIR/(row['uploaded_file_path'] or '')).resolve()
        if APP.SUBMISSION_DIR.resolve() not in target.parents or not target.is_file():handler.send_error(404)
        else:handler.send_download(target.read_bytes(),'application/octet-stream',row['storage_path'] or target.name)
        return True
    return False

def http_post(handler,path,payload):
    if path=='/api/evidence/login':
        handler.json_response(login(payload.get('code'),handler.client_address[0]));return True
    if path=='/api/evidence/logout':
        logout(handler.headers.get('X-Evidence-Session',''));handler.json_response({'ok':True});return True
    if path=='/api/admin/evidence-tasks':
        actor=handler.require_admin()
        if actor:handler.json_response(create(payload,actor))
        return True
    import re
    match=re.fullmatch(r'/api/admin/evidence-tasks/([a-f0-9]+)/(decision|reset-code)',path)
    if match:
        actor=handler.require_admin()
        if actor:handler.json_response(decide(match[1],payload,actor) if match[2]=='decision' else reset_code(match[1],actor))
        return True
    return False
