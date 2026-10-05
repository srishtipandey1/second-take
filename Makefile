ifeq ($(OS),Windows_NT)
PYTHON ?= .venv/Scripts/python.exe
else
PYTHON ?= .venv/bin/python
endif

.PHONY: run reproduce

run:
	$(PYTHON) -m uvicorn app:app --host 127.0.0.1 --port 8000

reproduce:
	$(PYTHON) -m unittest -v test_metrics
	$(PYTHON) -m compileall -q app.py test_metrics.py