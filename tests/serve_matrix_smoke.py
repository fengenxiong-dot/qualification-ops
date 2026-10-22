"""Temporary local UI-test server. Does not read or write the business database.

Run from the project root: python -B tests/serve_matrix_smoke.py
"""
import gc
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from qualification_matrix import default_matrix


def preview_pdf():
    content=b'BT /F1 18 Tf 40 220 Td (Evidence preview test) Tj ET'
    objects=[b'<</Type/Catalog/Pages 2 0 R>>',b'<</Type/Pages/Kids[3 0 R]/Count 1>>',
             b'<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
             b'<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
             b'<</Length '+str(len(content)).encode()+b'>>\nstream\n'+content+b'\nendstream']
    data=b'%PDF-1.4\n';offsets=[]
    for i,obj in enumerate(objects,1):
        offsets.append(len(data));data+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    xref=len(data);data+=b'xref\n0 6\n0000000000 65535 f \n'
    data+=b''.join(f'{offset:010} 00000 n \n'.encode() for offset in offsets)
    return data+b'trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n'+str(xref).encode()+b'\n%%EOF\n'


if __name__ == '__main__':
    port = int(os.environ.get('CERT_SMOKE_PORT', '8788'))
    with tempfile.TemporaryDirectory(prefix='qualification-matrix-smoke-') as directory:
        server.DATA_DIR = Path(directory)
        server.DB_PATH = server.DATA_DIR / 'test.db'
        server.STAGING_DIR = server.DATA_DIR / 'staging'
        server.SUBMISSION_DIR = server.DATA_DIR / 'submissions'
        server.init_storage()
        family=server.save_job_taxonomy({'name':'界面测试职族','kind':'family'})
        category=server.save_job_taxonomy({'name':'界面测试职类','kind':'category','parentId':family['id']})
        sub=server.save_job_taxonomy({'name':'界面测试子类','kind':'subcategory','parentId':category['id']})
        actor={'userId':'mock-admin','name':'界面测试管理员','role':'管理员'}
        server.save_job_positions(sub['id'],{'positions':{'1':'助理工程师','7':'专家工程师'},'original':{}})
        value=default_matrix()
        for d in value['dimensions']:
            d['rows']=[{'id':d['id']+'r','name':d['name']+'测试项','cells':{str(i):f'测试新增要求{i}' for i in range(1,8 if d['basis']=='grade' else 5)}}]
        matrix_standard=server.save_matrix_standard({'name':'矩阵回归测试存档','subcategoryId':sub['id'],'status':'已存档','matrix':value},actor)
        if '--review-items' in sys.argv:
            import base64
            import io
            import evidence_workflow as ew
            created=ew.create({'name':'逐项评分测试人','employeeNo':'REVIEW-DEMO','currentLevel':'一级','standardId':matrix_standard['standard']['id'],'grade':7},actor)
            sid=created['submission']['id'];owner={'name':'逐项评分测试人','userId':created['submission']['owner_external_user_id'],'role':'举证人'}
            detail=server.submission_detail(sid)
            behavior_id=next(m['id'] for m in detail['modules'] if m['section_type']=='standard')
            picture=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=')
            server.store_application_attachment(sid,'项目截图.png',io.BytesIO(picture),len(picture),owner,behavior_id)
            server.store_application_attachment(sid,'项目证明.docx',io.BytesIO(b'test document'),13,owner,detail['modules'][1]['id'])
            pdf=preview_pdf()
            server.store_application_attachment(sid,'综合补充.pdf',io.BytesIO(pdf),len(pdf),owner,behavior_id)
            detail=server.submission_detail(sid)
            detail=server.save_online_application(sid,{'revision':detail['evidenceTask']['revision'],'submit':True,'modules':[{'moduleId':m['id'],'evidence':'项目背景：交付平台能力。本人行动：制定方案并推动实施。项目结果：按期完成交付，请结合本项关联附件核验。'} for m in detail['modules']]},owner)
            ew.decide(sid,{'action':'finalize','revision':detail['evidenceTask']['revision']},actor)
            ordinary=[m for m in detail['modules'] if m['section_type']!='bonus']
            server.save_matrix_review_weights(sid,{'weights':{m['id']:1/len(ordinary) for m in ordinary}})
            assigned=server.upsert_assignment({'submissionId':sid,'reviewerName':'逐项测试评委','weight':1})
            print(f'ISOLATED REVIEW http://127.0.0.1:{port}/#review='+assigned['token'],flush=True)
        if '--feedback' in sys.argv:
            import evidence_workflow as ew
            created=ew.create({'name':'修改高亮测试人','employeeNo':'FEEDBACK-DEMO','currentLevel':'一级','standardId':matrix_standard['standard']['id'],'grade':7},actor)
            sid=created['submission']['id'];owner={'name':'修改高亮测试人','userId':created['submission']['owner_external_user_id'],'role':'举证人'}
            detail=server.submission_detail(sid)
            detail=server.save_online_application(sid,{'revision':detail['evidenceTask']['revision'],'submit':True,'modules':[{'moduleId':m['id'],'evidence':'修改前举证'} for m in detail['modules']]},owner)
            detail=ew.decide(sid,{'action':'return','note':'请补充项目成果数据，并说明本人承担的职责。','revision':detail['evidenceTask']['revision']},actor)
            server.save_online_application(sid,{'revision':detail['evidenceTask']['revision'],'modules':[{'moduleId':detail['modules'][0]['id'],'evidence':''}]},owner)
            print('ISOLATED FEEDBACK TEST CODE: '+created['code'],flush=True)
        if '--legacy' in sys.argv:
            payload={'name':'旧格式迭代回归测试','level':'T4','subcategoryId':sub['id'],'status':'已存档',
                     'framework':{key:{'content':label+'原文','method':'旧版认证方法'} for key,label in server.FRAMEWORK_SECTIONS},
                     'modules':[{'sectionType':'standard','moduleName':'需求分析','standard':'独立分析需求','weight':1}]}
            first=server.save_qualification_standard(payload,actor)['standard']
            second=server.iterate_qualification_standard(first['id'],actor,'测试历史存档聚合')['standard']
            server.save_qualification_standard({**payload,'revision':second['revision']},actor,second['id'])
        http=server.CertificationHTTPServer(('127.0.0.1',port),server.Handler)
        print(f'ISOLATED MATRIX TEST SERVER http://127.0.0.1:{port}/',flush=True)
        try:
            http.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            http.server_close()
            gc.collect()
