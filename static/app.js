const recordButton = document.querySelector("#record-button");
const recordButtonText = document.querySelector("#record-button-text");
const analyzeButton = document.querySelector("#analyze-button");
const recordingStatus = document.querySelector("#recording-status");
const errorMessage = document.querySelector("#error-message");
const loadingMessage = document.querySelector("#loading-message");
const resultSection = document.querySelector("#result-section");
const audioPlayer = document.querySelector("#audio-player");
const waveform = document.querySelector("#waveform");
const trendChart = document.querySelector("#trend-chart");
let recorder;
let recordedChunks = [];
let recordingBlob;
let recordingUrl;
let currentTake;

recordButton.addEventListener("click", async () => {
  errorMessage.hidden = true;
  if (recorder?.state === "recording") {
    recorder.stop();
    recordButton.disabled = true;
    recordingStatus.textContent = "Finishing recording...";
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showError("This browser does not support local audio recording. Try a recent version of Chrome or Edge.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"]
      .find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordedChunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) recordedChunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      recordingBlob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingUrl = URL.createObjectURL(recordingBlob);
      audioPlayer.src = recordingUrl;
      analyzeButton.disabled = false;
      recordButton.disabled = false;
      recordButton.classList.remove("is-recording");
      recordButtonText.textContent = "Record again";
      recordingStatus.textContent = "Recording ready";
      drawWaveform(recordingBlob, []);
    });
    recorder.start();
    recordButtonText.textContent = "Stop";
    recordButton.classList.add("is-recording");
    recordingStatus.textContent = "Recording in progress";
  } catch (error) {
    showError(`Microphone access failed. Allow microphone access and try again. ${error.message}`);
  }
});

document.querySelector("#recording-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!recordingBlob) return;
  errorMessage.hidden = true;
  loadingMessage.hidden = false;
  analyzeButton.disabled = true;
  recordButton.disabled = true;
  recordingStatus.textContent = "Analyzing";
  const payload = new FormData();
  const extension = recordingBlob.type.includes("ogg") ? "ogg" : "webm";
  payload.append("audio", recordingBlob, `take.${extension}`);
  payload.append("label", document.querySelector("#take-label").value);
  try {
    const response = await fetch("/analyze", { method: "POST", body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "The take could not be analyzed.");
    currentTake = result;
    renderTake(result);
    await loadTakes();
    recordingStatus.textContent = "Analysis complete";
  } catch (error) {
    showError(error.message);
    recordingStatus.textContent = "Analysis needs attention";
  } finally {
    loadingMessage.hidden = true;
    analyzeButton.disabled = false;
    recordButton.disabled = false;
  }
});

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function seekTo(seconds) {
  audioPlayer.currentTime = seconds;
  audioPlayer.play().catch(() => {});
}

function renderTake(take) {
  resultSection.hidden = false;
  document.querySelector("#result-title").textContent = take.label;
  const metricItems = [
    ["Duration", `${take.duration_seconds.toFixed(1)} sec`],
    ["Speaking pace", `${take.overall_wpm.toFixed(1)} wpm`],
    ["Fillers per minute", take.fillers_per_minute.toFixed(1)],
    ["Long pauses", String(take.long_pauses.length)],
  ];
  const metricsGrid = document.querySelector("#metrics-grid");
  metricsGrid.replaceChildren(...metricItems.map(([name, value]) => {
    const item = document.createElement("div");
    item.className = "metric-item";
    const number = document.createElement("strong");
    number.textContent = value;
    const label = document.createElement("span");
    label.textContent = name;
    item.append(number, label);
    return item;
  }));

  const fillerRanges = [...take.hesitation_fillers, ...take.filler_words];
  const highlightedIndexes = new Set(take.long_pauses.flatMap((pause) => [pause.before_index, pause.after_index]));
  const transcript = document.querySelector("#transcript");
  transcript.replaceChildren(...take.words.map((word, index) => {
    const span = document.createElement("button");
    span.type = "button";
    span.className = "transcript-word";
    if (fillerRanges.some((filler) => filler.start <= word.start && filler.end >= word.end)) span.classList.add("is-filler");
    if (highlightedIndexes.has(index)) span.classList.add("near-pause");
    span.textContent = word.word;
    span.title = `Seek to ${word.start.toFixed(1)} seconds`;
    span.addEventListener("click", () => seekTo(word.start));
    return span;
  }));

  const pauseList = document.querySelector("#pause-list");
  pauseList.replaceChildren();
  for (const pause of take.long_pauses) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pause-chip";
    button.textContent = `${pause.start.toFixed(1)}s pause · ${pause.length.toFixed(1)}s · “${pause.before.trim()}” to “${pause.after.trim()}”`;
    button.addEventListener("click", () => seekTo(pause.start));
    pauseList.append(button);
  }

  const tipsList = document.querySelector("#tips-list");
  tipsList.replaceChildren(...take.tips.map((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    return item;
  }));
  const coachingError = document.querySelector("#coaching-error");
  coachingError.hidden = !take.coaching_error;
  coachingError.textContent = take.coaching_error || "";
  const numbersWarning = document.querySelector("#numbers-warning");
  numbersWarning.hidden = take.numbers_check.ok;
  numbersWarning.textContent = take.numbers_check.ok ? "" : `Number check: the tips included numbers not found in the computed metrics (${take.numbers_check.unexpected.join(", ") || "not checked"}).`;
  drawWaveform(recordingBlob, take.long_pauses, take.duration_seconds);
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function drawWaveform(blob, pauses, duration) {
  const context = waveform.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, waveform.clientWidth);
  const height = 80;
  waveform.width = width * ratio;
  waveform.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#dce8e2";
  context.fillRect(0, height / 2 - 1, width, 2);
  if (duration) {
    context.fillStyle = "rgba(195, 111, 64, 0.2)";
    pauses.forEach((pause) => context.fillRect((pause.start / duration) * width, 0, Math.max(2, (pause.length / duration) * width), height));
  }
  try {
    const audioContext = new AudioContext();
    const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const samples = Math.min(width, 1000);
    context.strokeStyle = "#176b5b";
    context.lineWidth = 1;
    context.beginPath();
    for (let pixel = 0; pixel < samples; pixel += 1) {
      const from = Math.floor((pixel / samples) * channel.length);
      const to = Math.max(from + 1, Math.floor(((pixel + 1) / samples) * channel.length));
      let peak = 0;
      for (let sample = from; sample < to; sample += 1) peak = Math.max(peak, Math.abs(channel[sample]));
      const amplitude = peak * height * 0.42;
      context.moveTo(pixel, height / 2 - amplitude);
      context.lineTo(pixel, height / 2 + amplitude);
    }
    context.stroke();
    await audioContext.close();
  } catch {
    context.fillStyle = "#176b5b";
    context.fillRect(0, height / 2 - 1, width, 2);
  }
}

async function loadTakes() {
  const response = await fetch("/takes");
  if (!response.ok) throw new Error("Could not load the take history.");
  const takes = await response.json();
  const visibleTakes = takes.slice(-12);
  document.querySelector("#take-count").textContent = `${takes.length} ${takes.length === 1 ? "take" : "takes"}`;
  document.querySelector("#trend-empty").hidden = takes.length > 0;
  document.querySelector("#trend-content").hidden = takes.length === 0;
  if (!takes.length) return;
  drawTrend(visibleTakes);
  const list = document.querySelector("#take-list");
  list.replaceChildren(...visibleTakes.slice().reverse().map((take) => {
    const item = document.createElement("li");
    const row = document.createElement("div");
    row.className = "take-row";
    const title = document.createElement("strong");
    title.textContent = take.label;
    const detail = document.createElement("span");
    detail.textContent = `${take.fillers_per_minute.toFixed(1)} fillers/min · ${take.long_pauses.length} long pauses`;
    row.append(title, detail);
    item.append(row);
    return item;
  }));
}

function drawTrend(takes) {
  const context = trendChart.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, trendChart.clientWidth);
  const height = 170;
  trendChart.width = width * ratio;
  trendChart.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  const maxValue = Math.max(1, ...takes.flatMap((take) => [take.fillers_per_minute, take.long_pauses.length]));
  const groupWidth = width / takes.length;
  const barWidth = Math.min(18, groupWidth * 0.28);
  takes.forEach((take, index) => {
    const center = groupWidth * index + groupWidth / 2;
    const fillerHeight = take.fillers_per_minute / maxValue * 126;
    const pauseHeight = take.long_pauses.length / maxValue * 126;
    context.fillStyle = "#176b5b";
    context.fillRect(center - barWidth - 2, 140 - fillerHeight, barWidth, fillerHeight);
    context.fillStyle = "#c36f40";
    context.fillRect(center + 2, 140 - pauseHeight, barWidth, pauseHeight);
    context.fillStyle = "#5f6b66";
    context.font = "11px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(String(index + 1), center, 158);
  });
  context.strokeStyle = "#cbd2cd";
  context.beginPath();
  context.moveTo(0, 140.5);
  context.lineTo(width, 140.5);
  context.stroke();
}

window.addEventListener("resize", () => {
  if (recordingBlob) drawWaveform(recordingBlob, currentTake?.long_pauses || [], currentTake?.duration_seconds);
  fetch("/takes").then((response) => response.json()).then((takes) => {
    if (takes.length) drawTrend(takes.slice(-12));
  }).catch(() => {});
});

loadTakes().catch((error) => showError(error.message));