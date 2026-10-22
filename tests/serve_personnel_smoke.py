"""Independent UI demo data; never opens the business database."""
import os
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from test_personnel import PersonnelTests


if __name__=='__main__':
    fixture=PersonnelTests();fixture.setUp()
    try:
        pid=fixture.person('示例员工甲','DEMO-001')
        fixture.manual(pid,'2023-01-01','二级')
        fixture.manual(pid,'2024-03-01',outcome='未通过',promoted=False)
        fixture.manual(pid,'2025-06-01','三级')
        app=fixture.application();fixture.complete(app)
        server.link_personnel_submission(pid,app['submission']['id'],fixture.admin)
        second=fixture.person('示例员工乙','DEMO-002','T3')
        fixture.manual(second,'2024-08-01','T4',outcome='未通过',promoted=False)
        fixture.application()
        port=int(os.environ.get('CERT_SMOKE_PORT','8791'))
        http=server.CertificationHTTPServer(('127.0.0.1',port),server.Handler)
        print(f'PERSONNEL DEMO http://127.0.0.1:{port}/',flush=True)
        try:http.serve_forever()
        except KeyboardInterrupt:pass
        finally:http.server_close()
    finally:fixture.tearDown()
