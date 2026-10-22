import http.client
import io
import json
import sqlite3
import threading
import time
import unittest
import uuid
from unittest.mock import patch

import server
import evidence_workflow as ew
import test_standard_framework as framework_fixtures
import test_matrix as matrix_fixtures


class EvidenceWorkflowTests(unittest.TestCase):
    setUp=framework_fixtures.StandardFrameworkTests.setUp
    tearDown=framework_fixtures.StandardFrameworkTests.tearDown

    def create(self,name='举证人甲',employee_no=None,current_level='一级'):
        matrix=matrix_fixtures.MatrixTests.matrix(self)
        standard=server.save_matrix_standard({'name':'举证测试标准','subcategoryId':self.sub['id'],'status':'已存档','matrix':matrix},self.admin)
        result=ew.create({'name':name,'employeeNo':employee_no or uuid.uuid4().hex,'currentLevel':current_level,'standardId':standard['standard']['id'],'grade':7,'instructions':'按项目提供事例和证明'},self.admin)
        login=ew.login(result['code'],client=result['submission']['id'])
        return result,ew.session_actor(login['sessionToken']),login['sessionToken']

    def save(self,sid,actor,submit=True):
        detail=server.submission_detail(sid)
        return server.save_online_application(sid,{'name':'试图更名','revision':detail['evidenceTask']['revision'],'submit':submit,
            'modules':[{'moduleId':m['id'],'evidence':'背景、行动、结果及证明','selfScore':'符合'} for m in detail['modules']]},actor)

    def decide(self,sid,action,note=''):
        detail=server.submission_detail(sid)
        return ew.decide(sid,{'action':action,'note':note,'revision':detail['evidenceTask']['revision']},self.admin)

    def configure_weights(self,sid):
        modules=[m for m in server.submission_detail(sid)['modules'] if m['section_type']!='bonus']
        server.save_matrix_review_weights(sid,{'weights':{m['id']:1/len(modules) for m in modules}})

    def test_configuration_automatically_creates_identity_and_reuses_employee_number(self):
        created,actor,_=self.create(employee_no=' a001 ',current_level='二级');sid=created['submission']['id']
        data=server.personnel_data();self.assertEqual(len(data['items']),1);self.assertEqual(data['unlinked'],[])
        person=data['items'][0];self.assertEqual((person['employee_no'],person['initial_level'],person['currentLevel']),('A001','二级','二级'))
        self.assertEqual(person['records'][0]['submission_id'],sid)
        self.assertEqual(person['records'][0]['source']['currentLevel'],'二级')
        self.assertEqual(server.submission_detail(sid)['evidenceTask']['identity']['employeeNo'],'A001')
        self.save(sid,actor);self.decide(sid,'finalize');self.configure_weights(sid)
        assigned=server.upsert_assignment({'submissionId':sid,'reviewerName':'评委甲','weight':1})
        modules=server.submission_detail(sid)['modules']
        server.save_assigned_review(assigned['token'],{'submit':True,'moduleScores':[{'moduleId':m['id'],'score':0 if m['section_type']=='bonus' else 5} for m in modules]})
        server.save_personnel_certification(person['id'],{'revision':0,'outcome':'通过','decidedOn':server.now_text()[:10],
            'effectiveOn':server.now_text()[:10],'resultLevel':'七级','promoted':True},self.admin,person['records'][0]['id'])
        self.create(employee_no='a001',current_level='七级')
        person=server.personnel_data()['items'][0]
        self.assertEqual((person['initial_level'],person['currentLevel'],person['certificationCount'],person['promotionCount']),('二级','七级',2,1))
        with self.assertRaisesRegex(ValueError,'当前职级'):self.create(employee_no='A001',current_level='二级')
        with self.assertRaisesRegex(ValueError,'姓名'):self.create('另一个人',employee_no='A001',current_level='七级')
        self.assertEqual(len(server.personnel_data()['items']),1)
        self.assertEqual(server.personnel_data()['items'][0]['certificationCount'],2)

    def test_configuration_identity_is_required_and_atomic_with_task_creation(self):
        created,_,_=self.create();standard_id=created['submission']['standard_id']
        payload={'name':'新举证人','employeeNo':'NEW-001','currentLevel':'一级','standardId':standard_id,'grade':7}
        for field in ('employeeNo','currentLevel'):
            with self.assertRaises(ValueError):ew.create({**payload,field:''},self.admin)
        with server.db() as conn:before=conn.execute('SELECT COUNT(*) FROM submissions').fetchone()[0]
        with patch.object(ew,'insert_task',side_effect=ValueError('模拟任务写入失败')):
            with self.assertRaisesRegex(ValueError,'模拟'):ew.create(payload,self.admin)
        with server.db() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM submissions').fetchone()[0],before)
            self.assertIsNone(conn.execute("SELECT id FROM personnel WHERE employee_no='NEW-001'").fetchone())

    def test_attachment_requires_one_owner_and_can_move_without_sharing(self):
        created,actor,_=self.create();sid=created['submission']['id']
        modules=server.submission_detail(sid)['modules'];first,second=modules[0]['id'],modules[1]['id']
        with self.assertRaisesRegex(ValueError,'选择一个'):
            server.store_application_attachment(sid,'proof.pdf',io.BytesIO(b'proof'),5,actor)
        with self.assertRaisesRegex(ValueError,'选择一个'):
            server.store_application_link(sid,{'materialName':'文档','linkUrl':'https://example.com/proof'},actor)
        files=[server.store_application_attachment(sid,name,io.BytesIO(b'proof'),5,actor,first) for name in ('one.pdf','two.pdf')]
        link=server.store_application_link(sid,{'moduleId':first,'materialName':'文档','linkUrl':'https://example.com/proof'},actor)
        self.assertEqual(len(server.submission_detail(sid)['modules'][0]['attachment_ids']),3)
        with server.db() as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute('INSERT INTO module_attachments VALUES(?,?,?)',(second,files[0]['id'],'重复关联'))
        server.reassign_application_attachment(sid,files[0]['id'],second,actor)
        detail=server.submission_detail(sid)
        self.assertEqual(set(detail['modules'][0]['attachment_ids']),{files[1]['id'],link['id']})
        self.assertEqual(detail['modules'][1]['attachment_ids'],[files[0]['id']])
        other,other_actor,_=self.create('乙');other_id=other['submission']['id']
        foreign=server.submission_detail(other_id)['modules'][0]['id']
        with self.assertRaises(ValueError):server.reassign_application_attachment(sid,files[0]['id'],foreign,actor)
        with self.assertRaises(PermissionError):server.reassign_application_attachment(sid,files[0]['id'],first,other_actor)
        self.save(sid,actor)
        with self.assertRaises(ValueError):server.reassign_application_attachment(sid,files[0]['id'],first,actor)
        self.decide(sid,'return','调整附件')
        server.reassign_application_attachment(sid,files[0]['id'],first,actor)
        self.assertEqual(server.submission_detail(sid)['evidenceTask']['changes']['attachments'][0]['action'],'调整附件归属')

    def test_unassigned_legacy_attachment_blocks_submission_until_reassigned(self):
        created,actor,_=self.create();sid=created['submission']['id'];module=server.submission_detail(sid)['modules'][0]['id']
        file=server.store_application_attachment(sid,'proof.pdf',io.BytesIO(b'proof'),5,actor,module)
        with server.db() as conn:conn.execute('DELETE FROM module_attachments WHERE attachment_id=?',(file['id'],))
        with self.assertRaisesRegex(ValueError,'必须且只能'):self.save(sid,actor)
        server.reassign_application_attachment(sid,file['id'],module,actor)
        self.assertEqual(self.save(sid,actor)['submission']['status'],'待管理员确认')

    def test_configuration_locks_identity_grade_and_snapshot_and_hashes_code(self):
        created,actor,token=self.create();sid=created['submission']['id']
        detail=self.save(sid,actor,False)
        self.assertEqual(detail['submission']['name'],'举证人甲')
        self.assertEqual(detail['submission']['level'],'七级')
        snapshot=json.loads(detail['submission']['standard_snapshot_json'])
        self.assertEqual(len(snapshot['resolved'][0]['rows'][0]['requirements']),7)
        with server.db() as conn:
            row=ew.task(conn,sid);self.assertNotEqual(row['code_hash'],created['code'])
            self.assertNotIn(token,str(conn.execute('SELECT * FROM evidence_sessions').fetchone()))
        with self.assertRaises(PermissionError):server.create_online_application(snapshot['id'],actor,1)

    def test_submit_return_resubmit_finalize_assign_and_score(self):
        created,actor,_=self.create();sid=created['submission']['id']
        assignment={'submissionId':sid,'reviewerName':'评委甲','weight':1}
        with self.assertRaisesRegex(ValueError,'定稿'):server.upsert_assignment(assignment)
        with self.assertRaisesRegex(ValueError,'定稿'):server.save_review(sid,{'submit':True})
        submitted=self.save(sid,actor);self.assertEqual(submitted['submission']['status'],'待管理员确认')
        with self.assertRaises(ValueError):self.save(sid,actor,False)
        with self.assertRaises(ValueError):self.decide(sid,'return')
        returned=self.decide(sid,'return','请补充实际成果数据');self.assertEqual(returned['submission']['status'],'退回修改')
        self.assertEqual(self.save(sid,actor,False)['submission']['status'],'退回修改')
        self.save(sid,actor);final=self.decide(sid,'finalize','材料齐全')
        self.assertEqual(final['submission']['status'],'已定稿');self.assertTrue(final['evidenceTask']['finalizedAt'])
        with self.assertRaises(ValueError):self.decide(sid,'return','再次退回')
        with self.assertRaisesRegex(ValueError,'先.*子维度权重'):server.upsert_assignment(assignment)
        ordinary=[m for m in final['modules'] if m['section_type']!='bonus']
        server.save_matrix_review_weights(sid,{'weights':{m['id']:1/len(ordinary) for m in ordinary}})
        assigned=server.upsert_assignment(assignment);self.assertTrue(assigned['token'])
        score=server.save_assigned_review(assigned['token'],{'submit':True,'moduleScores':[{'moduleId':m['id'],'score':0 if m['section_type']=='bonus' else 5} for m in final['modules']]})
        self.assertEqual(score['scoreSummary']['total'],100)
        self.assertEqual(sum(e['action']=='提交举证' for e in final['evidenceTask']['events']),2)
        with self.assertRaises(PermissionError):server.save_public_review(sid,{'reviewerName':'未经分配者'})

    def test_assigned_tasks_visible_without_push_and_only_to_assigned_reviewers(self):
        created,actor,_=self.create('张三');sid=created['submission']['id']
        self.save(sid,actor);self.decide(sid,'finalize')
        self.configure_weights(sid)
        assignments=[]
        for i in range(3):
            assignments.append(server.upsert_assignment({'submissionId':sid,'reviewerName':f'评委{i}',
                'reviewerUserId':f'test-reviewer-{i}','weight':1/3}))
        for i,assignment in enumerate(assignments):
            items=server.my_review_tasks(f'test-reviewer-{i}')
            self.assertEqual([x['id'] for x in items],[assignment['id']])
            self.assertEqual(items[0]['submission_name'],'张三')
            self.assertIsNone(items[0]['pushed_at'])
        self.assertEqual(server.my_review_tasks('unassigned-reviewer'),[])
        with server.db() as conn:
            reviewer=conn.execute('SELECT reviewer_id FROM review_assignments WHERE id=?',(assignments[0]['id'],)).fetchone()[0]
        self.assertEqual([x['token'] for x in server.public_reviewer_tasks(reviewer)],[assignments[0]['token']])
        # Both entry points must still exclude evidence that is not finalized.
        with server.db() as conn:
            conn.execute('UPDATE evidence_tasks SET finalized_at=NULL WHERE submission_id=?',(sid,))
        self.assertEqual(server.my_review_tasks('test-reviewer-0'),[])
        self.assertEqual(server.public_reviewer_tasks(reviewer),[])

    def test_reviewer_api_omits_private_workflow_but_keeps_material_and_attachment_access(self):
        created,actor,_=self.create();sid=created['submission']['id']
        module=server.submission_detail(sid)['modules'][0]['id']
        file=server.store_application_attachment(sid,'proof.pdf',io.BytesIO(b'proof'),5,actor,module)
        self.save(sid,actor);self.decide(sid,'return','PRIVATE_RETURN_NOTE')
        self.save(sid,actor);final=self.decide(sid,'finalize','PRIVATE_FINALIZE_NOTE')
        self.configure_weights(sid)
        assigned=server.upsert_assignment({'submissionId':sid,'reviewerName':'评委甲','weight':1})
        detail=server.assigned_review_detail(assigned['token'])
        self.assertEqual(detail['evidenceTask'],{'finalizedAt':final['evidenceTask']['finalizedAt']})
        self.assertEqual(detail['modules'][0]['evidence'],'背景、行动、结果及证明')
        self.assertIn(file['id'],detail['modules'][0]['attachment_ids'])
        owner_detail=server.submission_detail(sid)
        self.assertEqual(owner_detail['evidenceTask']['instructions'],'按项目提供事例和证明')
        self.assertIn('PRIVATE_RETURN_NOTE',json.dumps(owner_detail))
        http=server.CertificationHTTPServer(('127.0.0.1',0),server.Handler)
        thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        def get(path,cookie=''):
            conn=http_client(http.server_port);conn.request('GET',path,headers={'Cookie':cookie})
            response=conn.getresponse();data=response.read();status=response.status;conn.close();return status,data
        try:
            for cookie in ('','cert_mock_user=mock-admin'):
                status,data=get('/api/review/'+assigned['token'],cookie)
                self.assertEqual(status,200)
                body=json.loads(data)
                self.assertEqual(set(body['evidenceTask']),{'finalizedAt'})
                for text in (b'PRIVATE_RETURN_NOTE',b'PRIVATE_FINALIZE_NOTE',b'"instructions"',b'"changes"',b'"events"'):
                    self.assertNotIn(text,data)
            status,data=get('/api/submissions/'+sid,'cert_mock_user=mock-admin')
            self.assertEqual(status,200);self.assertIn(b'PRIVATE_RETURN_NOTE',data)
            attachment=detail['attachments'][0]
            status,data=get('/media/'+attachment['uploaded_file_path'].replace('\\','/')+'?review='+assigned['token'])
            self.assertEqual((status,data),(200,b'proof'))
            media='/media/'+attachment['uploaded_file_path'].replace('\\','/')
            conn=http_client(http.server_port)
            conn.request('GET',media+'?review='+assigned['token']+'&preview=1')
            response=conn.getresponse()
            self.assertEqual(response.status,200)
            self.assertEqual(response.getheader('Content-Type'),'application/pdf')
            self.assertIsNone(response.getheader('Content-Disposition'))
            self.assertEqual(response.read(),b'proof');conn.close()
            self.assertEqual(get(media+'?preview=1','cert_mock_user=mock-student')[0],403)
            self.assertEqual(get(media+'?review=invalid&preview=1','cert_mock_user=mock-student')[0],403)
        finally:http.shutdown();http.server_close();thread.join()

    def test_stale_writes_and_missing_evidence_rejected(self):
        created,actor,_=self.create();sid=created['submission']['id'];detail=server.submission_detail(sid)
        revision=detail['evidenceTask']['revision']
        with self.assertRaises(ValueError):server.save_online_application(sid,{'submit':True,'revision':revision},actor)
        self.decide(sid,'feedback','请按指引填写')
        with self.assertRaisesRegex(ValueError,'更新'):server.save_online_application(sid,{'revision':revision},actor)
        self.assertEqual(server.submission_detail(sid)['modules'][0]['evidence'],'')
        self.assertNotIn(sid,[s['id'] for s in server.list_assignments()['submissions']])

    def test_sessions_reset_expire_and_cannot_access_other_tasks(self):
        a,actor,token=self.create();b,other,_=self.create('举证人乙');sid=a['submission']['id']
        with self.assertRaises(PermissionError):server.require_application_access(b['submission']['id'],actor)
        reset=ew.reset_code(sid,self.admin);self.assertIsNone(ew.session_actor(token))
        with self.assertRaises(ValueError):ew.login(a['code'],client='old-code')
        new=ew.login(reset['code'],client='new-code')['sessionToken'];self.assertTrue(ew.session_actor(new))
        with server.db() as conn:conn.execute('UPDATE evidence_sessions SET expires_at=? WHERE token_hash=?',(time.time()-1,ew.digest(new)))
        self.assertIsNone(ew.session_actor(new));self.assertFalse(ew.media_access(sid,other));self.assertFalse(ew.media_access(sid,None))

    def test_files_allowed_linking_ownership_lock_and_preserved_return_edits(self):
        created,actor,_=self.create();sid=created['submission']['id'];module=server.submission_detail(sid)['modules'][0]['id']
        for name in ('截图.png','证明.docx','汇总.xlsx','说明.pdf'):
            server.store_application_attachment(sid,name,io.BytesIO(b'test attachment'),15,actor,module)
        with self.assertRaises(ValueError):server.store_application_attachment(sid,'script.html',io.BytesIO(b'x'),1,actor,module)
        with self.assertRaises(ValueError):server.store_application_attachment(sid,'image.png',io.BytesIO(b'x'),1,actor,'unknown')
        self.assertEqual(len(server.submission_detail(sid)['attachments']),4)
        self.save(sid,actor)
        with self.assertRaises(ValueError):server.store_application_attachment(sid,'later.pdf',io.BytesIO(b'x'),1,actor)
        self.decide(sid,'return','补充证明')
        server.store_application_attachment(sid,'补充.pdf',io.BytesIO(b'x'),1,actor,module)
        self.assertEqual(len(server.submission_detail(sid)['attachments']),5)

    def test_assignment_requires_complete_weights_and_import_rejects_before_writing(self):
        from openpyxl import Workbook
        ready,owner,_=self.create('已配置者');ready_id=ready['submission']['id']
        self.save(ready_id,owner);self.decide(ready_id,'finalize');self.configure_weights(ready_id)
        created,actor,_=self.create('未配置者');sid=created['submission']['id']
        self.save(sid,actor);self.decide(sid,'finalize')
        self.assertFalse(next(s for s in server.list_assignments()['submissions'] if s['id']==sid)['reviewWeightsReady'])
        assignment={'submissionId':sid,'reviewerName':'评委甲','weight':1}
        for value in (None,0,.1):
            with server.db() as conn:
                conn.execute("UPDATE modules SET weight=? WHERE submission_id=? AND section_type!='bonus'",(value,sid))
            with self.assertRaisesRegex(ValueError,'子维度权重'):server.upsert_assignment(assignment)
        workbook=Workbook();sheet=workbook.active;sheet.title='评价关系'
        sheet.append(['被评价人','评价人','权重']);sheet.append(['已配置者','评委甲',100]);sheet.append(['未配置者','评委乙',100])
        stream=io.BytesIO();workbook.save(stream);workbook.close()
        result=server.import_assignment_workbook(stream.getvalue())
        self.assertEqual((result['created'],result['updated']),(0,0));self.assertIn('子维度权重',result['errors'][0])
        self.assertEqual(server.list_assignments()['assignments'],[])
        self.configure_weights(sid)
        self.assertTrue(next(s for s in server.list_assignments()['submissions'] if s['id']==sid)['reviewWeightsReady'])
        assigned=server.upsert_assignment(assignment)
        with server.db() as conn:conn.execute('UPDATE modules SET weight=NULL WHERE submission_id=?',(sid,))
        with self.assertRaisesRegex(ValueError,'子维度权重'):server.update_assignment(assigned['id'],{'reviewerName':'新评委','weight':1})

    def test_http_portal_isolation_code_reset_and_authenticated_download(self):
        created,actor,token=self.create();sid=created['submission']['id'];other,_,_=self.create('另一个人')
        file=server.store_application_attachment(sid,'proof.pdf',io.BytesIO(b'proof'),5,actor,server.submission_detail(sid)['modules'][0]['id'])
        http=server.CertificationHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        def request(method,path,body=None,session=token):
            conn=http_client(http.server_port)
            headers={'X-Evidence-Session':session,'Content-Type':'application/json','Cookie':'cert_mock_user=mock-admin'}
            conn.request(method,path,None if body is None else json.dumps(body),headers);response=conn.getresponse();data=response.read();status=response.status;conn.close();return status,data
        try:
            self.assertEqual(request('GET','/api/my/applications/'+sid)[0],200)
            self.assertEqual(request('GET','/api/my/applications/'+other['submission']['id'])[0],403)
            for path in ('/api/admin/evidence-tasks','/api/submissions','/api/public/submissions','/api/standards'):
                self.assertEqual(request('GET',path)[0],403)
            self.assertEqual(request('POST','/api/auth/mock-login',{'userId':'mock-admin'})[0],403)
            status,data=request('GET','/api/evidence/attachments/'+file['id']);self.assertEqual((status,data),(200,b'proof'))
            ew.reset_code(sid,self.admin);self.assertEqual(request('GET','/api/my/applications/'+sid)[0],401)
        finally:http.shutdown();http.server_close();thread.join()

    def test_changes_compare_latest_return_not_intermediate_draft(self):
        created,actor,_=self.create();sid=created['submission']['id']
        self.assertIsNone(server.submission_detail(sid)['evidenceTask']['changes'])
        self.save(sid,actor);self.decide(sid,'return','补充数据')
        detail=server.submission_detail(sid);mid=detail['modules'][0]['id']
        self.assertEqual(detail['evidenceTask']['changes']['modules'],[])
        for text in ('修改第一稿','修改第二稿'):
            server.save_online_application(sid,{'revision':detail['evidenceTask']['revision'],'modules':[{'moduleId':mid,'evidence':text,'selfScore':'已补充'}]},actor)
            detail=server.submission_detail(sid)
        change=detail['evidenceTask']['changes']['modules'][0]
        self.assertEqual(change['fields'][0]['before'],'背景、行动、结果及证明')
        self.assertEqual(change['fields'][0]['after'],'修改第二稿')
        self.assertTrue(detail['evidenceTask']['changes']['pendingResubmission'])
        server.store_application_attachment(sid,'新增证明.pdf',io.BytesIO(b'x'),1,actor,mid)
        detail=server.submission_detail(sid)
        self.assertEqual(detail['evidenceTask']['changes']['attachments'][0]['action'],'新增附件')
        server.save_online_application(sid,{'revision':detail['evidenceTask']['revision'],'submit':True},actor)
        self.assertFalse(server.submission_detail(sid)['evidenceTask']['changes']['pendingResubmission'])
        self.decide(sid,'return','再次补充')
        self.assertEqual(server.submission_detail(sid)['evidenceTask']['changes']['modules'],[])
        attachment=server.submission_detail(sid)['attachments'][0]
        server.delete_application_attachment(sid,attachment['id'],actor)
        self.assertEqual(server.submission_detail(sid)['evidenceTask']['changes']['attachments'][0]['action'],'移除附件')


def http_client(port):
    return http.client.HTTPConnection('127.0.0.1',port,timeout=10)
