let userId = localStorage.getItem("userid");
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem("userid", userId);
}

const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const submitBtn = form.querySelector("button");
const messagesEl = document.getElementById("messages");
const evidenceList = document.getElementById("evidence-list");
const stressBar = document.getElementById("stress-bar");
const trustBar = document.getElementById("trust-bar");
const stressValue = document.getElementById("stress-value");
const trustValue = document.getElementById("trust-value");
const tokensLine = document.getElementById("tokens-line");
const accuseBtn = document.getElementById("accuse-btn");
const resetBtn = document.getElementById("reset-btn");
const exportBtn = document.getElementById("export-btn");
const accuseModal = document.getElementById("accuse-modal");
const verdictModal = document.getElementById("verdict-modal");

let knownEvidence = new Set();
let caseData = null;
let transcript = [];

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function loadCase() {
  const res = await fetch("/api/case");
  const data = await res.json();
  caseData = data;

  document.getElementById("case-title").textContent = data.title;
  document.getElementById("briefing").textContent = data.briefing;
  document.getElementById("suspect-avatar").textContent = data.suspect.avatar;
  document.getElementById("suspect-name").textContent = data.suspect.name;
  document.getElementById("suspect-role").textContent = data.suspect.role;
  document.getElementById("accuse-name").textContent = data.suspect.name;

  evidenceList.innerHTML = "";
  knownEvidence.clear();
  for (const item of data.evidence) {
    addEvidenceItem(item, false);
  }
}

function addEvidenceItem(text, isNew) {
  if (knownEvidence.has(text)) return;
  knownEvidence.add(text);
  const li = document.createElement("li");
  li.textContent = text;
  if (isNew) li.classList.add("new-clue");
  evidenceList.appendChild(li);
}

function addUserMessage(content) {
  const wrapper = document.createElement("div");
  wrapper.className = "msg user";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function addSuspectMessage(data) {
  const wrapper = document.createElement("div");
  wrapper.className = "msg suspect";
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const dialogueEl = document.createElement("div");
  dialogueEl.innerHTML = marked.parse(data.dialogue || "");
  bubble.appendChild(dialogueEl);

  if (data.bodyLanguage) {
    const bl = document.createElement("span");
    bl.className = "body-language";
    bl.textContent = data.bodyLanguage;
    bubble.appendChild(bl);
  }

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return bubble;
}

function addThinkingBubble() {
  const wrapper = document.createElement("div");
  wrapper.className = "msg suspect thinking";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = "De verdachte denkt na...";
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function updateMeters(data) {
  if (typeof data.stress === "number") {
    stressBar.style.width = `${data.stress}%`;
    stressValue.textContent = `${data.stress}`;
  }
  if (typeof data.trust === "number") {
    trustBar.style.width = `${data.trust}%`;
    trustValue.textContent = `${data.trust}`;
  }
  if (typeof data.inputTokens === "number") {
    const total = data.inputTokens + data.outputTokens;
    tokensLine.textContent = `Tokens: ${total} (in: ${data.inputTokens} · out: ${data.outputTokens})`;
  }
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadHistory() {
  const data = await post("/api/gethistory", { userId });
  for (const msg of data.history) {
    if (msg.role === "user") {
      addUserMessage(msg.content);
    } else {
      addSuspectMessage({ dialogue: msg.content });
    }
  }
  updateMeters({
    stress: data.stress,
    trust: data.trust,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  submitBtn.disabled = true;

  addUserMessage(message);
  const thinking = addThinkingBubble();

  try {
    const data = await post("/api/chat", { userId, message });
    thinking.remove();

    if (data.error) {
      const errEl = addSuspectMessage({ dialogue: `_${data.message}_` });
      errEl.style.opacity = "0.6";
      return;
    }

    addSuspectMessage(data);
    updateMeters(data);
    transcript.push({ question: message, response: data });

    if (data.newClue) {
      addEvidenceItem(data.newClue, true);
    }
  } catch (err) {
    thinking.remove();
    const errEl = addSuspectMessage({
      dialogue: `_Netwerkfout: ${err.message}_`,
    });
    errEl.style.opacity = "0.6";
  } finally {
    submitBtn.disabled = false;
    input.focus();
  }
});

accuseBtn.addEventListener("click", () =>
  accuseModal.classList.remove("hidden"),
);
document
  .getElementById("accuse-cancel")
  .addEventListener("click", () => accuseModal.classList.add("hidden"));

async function submitVerdict(verdict) {
  accuseModal.classList.add("hidden");
  const data = await post("/api/accuse", { userId, verdict });
  document.getElementById("verdict-title").textContent = data.correct
    ? "Zaak opgelost!"
    : "Verkeerde beslissing";
  document.getElementById("verdict-text").textContent = data.explanation;
  verdictModal.classList.remove("hidden");
}

document
  .getElementById("accuse-guilty")
  .addEventListener("click", () => submitVerdict("schuldig"));
document
  .getElementById("accuse-innocent")
  .addEventListener("click", () => submitVerdict("onschuldig"));
document
  .getElementById("verdict-close")
  .addEventListener("click", () => verdictModal.classList.add("hidden"));

resetBtn.addEventListener("click", async () => {
  await post("/api/reset", { userId });
  messagesEl.innerHTML = "";
  stressBar.style.width = "0%";
  trustBar.style.width = "0%";
  stressValue.textContent = "–";
  trustValue.textContent = "–";
  tokensLine.textContent = "";
  transcript = [];
  await loadCase();
});

function buildExportMarkdown() {
  const lines = [];
  const title = caseData?.title ?? "Onbekende zaak";
  lines.push(`# Verhoor — ${title}`, "");
  if (caseData) {
    lines.push(
      `**Verdachte**: ${caseData.suspect.name} (${caseData.suspect.role})`,
    );
    lines.push("", `**Briefing**:`, caseData.briefing, "");
    lines.push("**Bewijs bij start**:");
    for (const e of caseData.evidence) lines.push(`- ${e}`);
    lines.push("");
  }
  lines.push("## Transcript", "");
  if (transcript.length === 0) {
    lines.push("_Geen beurten in deze sessie._");
  } else {
    transcript.forEach((turn, i) => {
      const r = turn.response;
      lines.push(`### Beurt ${i + 1}`, "");
      lines.push(`**Rechercheur**: ${turn.question}`);
      lines.push(
        `**Lars** (stress: ${r.stress}, trust: ${r.trust}): ${r.dialogue}`,
      );
      if (r.bodyLanguage) lines.push(`_${r.bodyLanguage}_`);
      if (r.newClue) lines.push(`[Nieuwe clue: ${r.newClue}]`);
      lines.push("");
    });
  }
  return lines.join("\n");
}

exportBtn.addEventListener("click", async () => {
  const md = buildExportMarkdown();
  const originalLabel = exportBtn.textContent;
  try {
    await navigator.clipboard.writeText(md);
    exportBtn.textContent = "Gekopieerd!";
  } catch {
    exportBtn.textContent = "Kopiëren mislukt";
  }
  setTimeout(() => {
    exportBtn.textContent = originalLabel;
  }, 2000);
});

await loadCase();
await loadHistory();
