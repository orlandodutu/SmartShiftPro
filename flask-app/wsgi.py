import importlib.util
import os

_app_path = os.path.join(os.path.dirname(__file__), 'app.py.py')
_spec = importlib.util.spec_from_file_location('smartshift_app', _app_path)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)

app = _module.app
