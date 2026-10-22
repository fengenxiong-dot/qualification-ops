import gc
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import server


class StandardFrameworkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.originals = {k: getattr(server, k) for k in ('DATA_DIR', 'DB_PATH', 'STAGING_DIR', 'SUBMISSION_DIR')}
        server.DATA_DIR = Path(self.temp.name)
        server.DB_PATH = server.DATA_DIR / 'certification.db'
        server.STAGING_DIR = server.DATA_DIR / 'staging'
        server.SUBMISSION_DIR = server.DATA_DIR / 'submissions'
        # Existing standard must survive migration without guessing its hierarchy.
        with sqlite3.connect(server.DB_PATH) as conn:
            conn.execute('CREATE TABLE qualification_standards(id TEXT PRIMARY KEY,name TEXT NOT NULL,level TEXT,category TEXT,description TEXT,status TEXT,created_by TEXT,created_at TEXT,updated_at TEXT)')
            conn.execute('INSERT INTO qualification_standards VALUES(?,?,?,?,?,?,?,?,?)', ('legacy', '旧标准', 'T4', '旧分类', '', '草稿', '', '2026-09-01', '2026-09-01'))
        server.init_storage()
        self.admin = {'userId': 'mock-admin', 'name': '管理员', 'role': '管理员'}
        self.student = {'userId': 'mock-student', 'name': '学员', 'role': '学员'}
        self.family = server.save_job_taxonomy({'name': '研发', 'kind': 'family'})
        self.category = server.save_job_taxonomy({'name': '软件', 'kind': 'category', 'parentId': self.family['id']})
        self.sub = server.save_job_taxonomy({'name': '平台软件', 'kind': 'subcategory', 'parentId': self.category['id']})

    def tearDown(self):
        for key, value in self.originals.items():
            setattr(server, key, value)
        gc.collect()
        self.temp.cleanup()

    def payload(self, sub=None):
        return {
            'name': '平台 T4', 'level': 'T4', 'subcategoryId': sub or self.sub['id'], 'status': '已存档',
            'framework': {key: {'content': label+'要求', 'method': '材料核验'} for key, label in server.FRAMEWORK_SECTIONS},
            'modules': [{'sectionType': 'standard', 'moduleName': '需求分析', 'standard': '独立分析需求', 'weight': 1},
                        {'sectionType': 'bonus', 'moduleName': '专业成果', 'standard': '成果转化'}],
        }

    def test_old_standard_is_unclassified_and_migration_is_repeatable(self):
        server.init_storage()
        result = server.qualification_standard_detail('legacy')['standard']
        self.assertEqual(result['category'], '旧分类')
        self.assertIsNone(result['subcategory_id'])
        self.assertEqual(set(result['framework']), {'basic', 'knowledge', 'skills', 'competencies'})
        self.assertEqual(len(server.list_job_taxonomy()), 3)
        saved = server.save_qualification_standard({'name': '旧标准', 'status': '草稿', 'modules': []}, self.admin, 'legacy')
        self.assertEqual(saved['standard']['category'], '旧分类')

    def test_tree_validation_rename_and_safe_delete(self):
        with self.assertRaises(ValueError):
            server.save_job_taxonomy({'name': '错误子类', 'kind': 'subcategory', 'parentId': self.family['id']})
        with self.assertRaises(ValueError):
            server.save_job_taxonomy({'name': '研发', 'kind': 'family'})
        with self.assertRaises(ValueError):
            server.delete_job_taxonomy(self.category['id'])
        server.save_job_taxonomy({'name': '平台技术'}, self.sub['id'])
        self.assertEqual(next(n for n in server.list_job_taxonomy() if n['id']==self.sub['id'])['name'], '平台技术')
        server.delete_job_taxonomy(self.sub['id'])
        self.assertEqual(len(server.list_job_taxonomy()), 2)

    def test_taxonomy_delete_guards_and_soft_disable(self):
        with self.assertRaisesRegex(ValueError, '下级'):
            server.delete_job_taxonomy(self.category['id'])
        with self.assertRaisesRegex(ValueError, '不存在'):
            server.set_job_taxonomy_active('missing', True)
        server.set_job_taxonomy_active(self.sub['id'], False)
        self.assertEqual(next(n for n in server.list_job_taxonomy() if n['id'] == self.sub['id'])['active'], 0)
        server.set_job_taxonomy_active(self.sub['id'], True)
        server.save_qualification_standard(self.payload(), self.admin)
        with self.assertRaisesRegex(ValueError, '停用'):
            server.delete_job_taxonomy(self.sub['id'])

    def test_publish_requires_leaf_and_subclasses_have_independent_standards(self):
        for invalid in ('', self.family['id'], self.category['id'], 'missing'):
            payload = self.payload()
            payload['subcategoryId'] = invalid
            with self.assertRaises(ValueError):
                server.save_qualification_standard(payload, self.admin)
        a = server.save_qualification_standard(self.payload(), self.admin)
        sub2 = server.save_job_taxonomy({'name': '嵌入式', 'kind': 'subcategory', 'parentId': self.category['id']})
        payload = self.payload(sub2['id'])
        payload['framework']['skills']['content'] = '设备调试'
        b = server.save_qualification_standard(payload, self.admin)
        self.assertNotEqual(a['standard']['id'], b['standard']['id'])
        self.assertEqual(a['standard']['subcategory_name'], '平台软件')
        self.assertEqual(b['standard']['framework']['skills']['content'], '设备调试')
        with self.assertRaises(ValueError):
            server.delete_job_taxonomy(sub2['id'])

    def test_application_snapshots_all_sections_and_score_calculation_stays_valid(self):
        payload = self.payload()
        detail = server.save_qualification_standard(payload, self.admin)
        sid = detail['standard']['id']
        application = server.create_online_application(sid, self.student)
        appid = application['submission']['id']
        snapshot = json.loads(application['submission']['standard_snapshot_json'])
        self.assertEqual(snapshot['family_name'], '研发')
        self.assertEqual(snapshot['framework']['knowledge']['content'], '知识标准要求')
        payload['framework']['knowledge']['content'] = '新的要求'
        iteration = server.iterate_qualification_standard(sid, self.admin, '更新知识要求')
        new_id = iteration['standard']['id']
        server.save_qualification_standard(payload, self.admin, new_id)
        server.save_job_taxonomy({'name': '新研发'}, self.family['id'])
        after = json.loads(server.submission_detail(appid)['submission']['standard_snapshot_json'])
        self.assertEqual(after, snapshot)
        submitted = server.save_online_application(appid, {'submit': True, 'modules': [
            {'moduleId': m['id'], 'evidence': '项目举证', 'selfScore': '4'} for m in application['modules']
        ]}, self.student)
        self.assertEqual(submitted['submission']['status'], '待评审')
        result = server.save_review(appid, {'reviewerName': '评委', 'submit': True, 'moduleScores': [
            {'moduleId': m['id'], 'score': 4 if m['section_type']=='standard' else 2} for m in application['modules']
        ]})
        self.assertEqual(result['scoreSummary']['total'], 82)
        copied = server.copy_submission_to_standard(appid, self.admin)
        self.assertEqual(copied['standard']['framework'], snapshot['framework'])
        self.assertEqual(server.qualification_standard_detail(new_id)['standard']['framework']['knowledge']['content'], '新的要求')
        self.assertEqual(server.qualification_standard_detail(sid)['standard']['family_name'], '研发')
        self.assertEqual(snapshot['version_number'], 1)

    def test_archive_iteration_history_and_reference_gate(self):
        payload = self.payload()
        payload['status'] = '草稿'
        first = server.save_qualification_standard(payload, self.admin)['standard']
        sid = first['id']
        self.assertEqual(server.list_qualification_standards(published_only=True), [])
        with self.assertRaisesRegex(ValueError, '只有已存档'):
            server.create_online_application(sid, self.student)
        with self.assertRaises(ValueError):
            server.iterate_qualification_standard(sid, self.admin, '不能迭代草稿')
        payload['status'] = '已存档'
        archived = server.save_qualification_standard(payload, self.admin, sid)['standard']
        self.assertTrue(archived['archived_at'])
        for status in ('草稿', '已存档'):
            payload['status'] = status
            with self.assertRaisesRegex(ValueError, '不可修改'):
                server.save_qualification_standard(payload, self.admin, sid)
        with self.assertRaises(ValueError):
            server.delete_qualification_standard(sid)
        second = server.iterate_qualification_standard(sid, self.admin, '补充知识')['standard']
        self.assertEqual(second['version_number'], 2)
        self.assertEqual(second['parent_version_id'], sid)
        with self.assertRaisesRegex(ValueError, '已有开发'):
            server.iterate_qualification_standard(sid, self.admin, '重复发起')
        with self.assertRaises(ValueError):
            server.create_online_application(second['id'], self.student)
        payload['framework']['knowledge']['content'] = '迭代新知识'
        payload['status'] = '迭代中'
        payload['revision'] = second['revision']
        server.save_qualification_standard(payload, self.admin, second['id'])
        with self.assertRaisesRegex(ValueError, '已被更新'):
            server.save_qualification_standard(payload, self.admin, second['id'])
        payload.pop('revision')
        payload['status'] = '已存档'
        server.save_qualification_standard(payload, self.admin, second['id'])
        self.assertEqual(len(server.list_qualification_standards(published_only=True)), 2)
        history = server.qualification_standard_history(sid)
        self.assertEqual(len(history), 5)
        self.assertEqual(history[-1]['snapshot']['standard']['framework']['knowledge']['content'], '知识标准要求')
        self.assertEqual(history[0]['snapshot']['standard']['framework']['knowledge']['content'], '迭代新知识')
        third = server.iterate_qualification_standard(sid, self.admin, '基于旧版继续迭代')['standard']
        self.assertEqual(third['version_number'], 3)
        self.assertEqual(third['parent_version_id'], sid)
        self.assertEqual(third['framework']['knowledge']['content'], '知识标准要求')

    def test_legacy_published_is_not_implicitly_archived(self):
        with server.db() as conn:
            conn.execute("UPDATE qualification_standards SET status='已发布' WHERE id='legacy'")
        server.init_storage()
        self.assertEqual(server.qualification_standard_detail('legacy')['standard']['status'], '已发布')
        self.assertEqual(server.list_qualification_standards(published_only=True), [])
        self.assertEqual(len(server.qualification_standard_history('legacy')), 1)

    def test_failed_archive_does_not_change_draft_or_history(self):
        payload = self.payload()
        payload['status'] = '草稿'
        sid = server.save_qualification_standard(payload, self.admin)['standard']['id']
        payload['status'] = '已存档'
        payload['modules'][0]['weight'] = .5
        with self.assertRaisesRegex(ValueError, '100%'):
            server.save_qualification_standard(payload, self.admin, sid)
        self.assertEqual(server.qualification_standard_detail(sid)['standard']['status'], '草稿')
        self.assertEqual(len(server.qualification_standard_history(sid)), 1)


if __name__ == '__main__':
    unittest.main()
