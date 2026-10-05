# Second Take

I made Second Take as a local speaking-practice partner. I can record a short English practice take in my browser, review its transcript and timing, and get three friendly suggestions from a local Gemma model.

## Run it

I use the project's Windows virtual environment for every Python command:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
ollama serve
ollama pull gemma3:1b
\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000
```

I open http://127.0.0.1:8000 after Uvicorn starts. I run `ollama serve` in its own terminal if Ollama is not already running. The model setting defaults to `gemma3:1b`; I can change it with `$env:SECOND_TAKE_OLLAMA_MODEL = "another-local-model"`. On its first use, faster-whisper downloads the `base.en` model. I run the metrics test with:

```powershell
\.venv\Scripts\python.exe -m unittest -v test_metrics
```

## What I measure

I derive duration, overall and 30-second-window speaking pace, long pauses, hesitation fillers (`um`, `uh`, `umm`, `er`, `hmm`), filler words (`like`, `basically`, `actually`, `you know`, `I mean`), and fillers per minute from Whisper's word timestamps. A long pause is a gap of at least 0.7 seconds between consecutive words. Duration ends at the last recognized word timestamp, so silence after the final word is not included. Each take's computed metrics and transcript are saved in `takes.json`; I do not save the audio.

## Limits and privacy

I process audio with faster-whisper on this computer and send only the computed metrics and transcript to the local Ollama service at `localhost`. The coach is instructed not to calculate or invent numbers; I also check numeric values in its reply against the computed metrics and flag extras. A local model may still give an imperfect or incomplete reply. Whisper can drop filler words even with the example prompt, and the measurements then reflect only the words it recognized. I support English and one speaker. This is practice feedback, not a replacement for a teacher. All audio processing and model requests are local; the audio is held temporarily for transcription and then discarded.