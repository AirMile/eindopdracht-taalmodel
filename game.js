import { AzureChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import * as z from "zod";
import { case1 } from "./case.js";

const SuspectResponse = z.object({
  dialogue: z.string().describe("Wat de verdachte hardop zegt"),
  bodyLanguage: z
    .string()
    .describe(
      "Observeerbare houding of gebaar: zit rechtop, leunt naar voren, gespannen schouders, etc.",
    ),
  stress: z
    .number()
    .min(0)
    .max(100)
    .describe("Huidig stressniveau van de verdachte, 0-100"),
  trust: z
    .number()
    .min(0)
    .max(100)
    .describe("Hoe veel de verdachte de rechercheur vertrouwt, 0-100"),
  newClue: z
    .string()
    .nullable()
    .describe(
      "Concreet nieuw feit dat deze beurt is onthuld. Null als er niets nieuws is.",
    ),
  factsStated: z
    .array(z.string())
    .describe(
      "Beknopte feiten/beweringen die Lars in deze dialogue heeft gedaan en waar hij consistent in moet blijven. Bijv. 'thuis rond 23:30', 'dienst tot 23:00', 'had wat papieren af te ronden', 'code nooit aan iemand gegeven'. Lege array als er niks nieuws beweerd is. Noteer alleen nieuwe beweringen, geen dingen die al in de lijst stonden.",
    ),
});

const baseModel = new AzureChatOpenAI({ temperature: 0.7 });
const model = baseModel.withStructuredOutput(SuspectResponse, {
  includeRaw: true,
});

function clampDelta(prev, next, maxUp, maxDown) {
  if (prev === null || prev === undefined)
    return Math.max(0, Math.min(100, next));
  const delta = next - prev;
  const clampedDelta = Math.max(-maxDown, Math.min(maxUp, delta));
  return Math.max(0, Math.min(100, prev + clampedDelta));
}

const userChats = new Map();
const userTokens = new Map();
const userLastState = new Map();
const userFacts = new Map();

function initUserSession(userId) {
  userChats.set(userId, []);
  userTokens.set(userId, { inputTokens: 0, outputTokens: 0 });
  userLastState.set(userId, { stress: null, trust: null });
  userFacts.set(userId, new Set());
}

function getUserChat(userId) {
  if (!userChats.has(userId)) initUserSession(userId);
  return userChats.get(userId);
}

export function resetUser(userId) {
  initUserSession(userId);
}

export function getHistoryForClient(userId) {
  const history = getUserChat(userId);
  const tokens = userTokens.get(userId);
  const state = userLastState.get(userId);
  return {
    history: history.slice(-10).map((msg) => ({
      role: msg instanceof HumanMessage ? "user" : "ai",
      content: msg.content,
    })),
    stress: state.stress,
    trust: state.trust,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
  };
}

export async function callSuspect(userId, userMessage) {
  const history = getUserChat(userId);
  const state = userLastState.get(userId);
  const facts = userFacts.get(userId);

  const stateNote =
    state.stress != null
      ? [
          new SystemMessage(
            `[HUIDIGE STAAT VAN LARS — bepaalt hoe je nu praat en reageert, en is de basis voor de nieuwe waarden]\nstress=${state.stress}, trust=${state.trust}`,
          ),
        ]
      : [];

  const factsNote =
    facts.size > 0
      ? [
          new SystemMessage(
            `[WAT JE EERDER IN DIT GESPREK HEBT GEZEGD — blijf hier consistent in. Als de rechercheur hiernaar vraagt, geef hetzelfde antwoord. Wijk alleen af als je je bewust laat betrappen op een tegenstrijdigheid onder druk.]\n- ${[...facts].join("\n- ")}`,
          ),
        ]
      : [];

  const messages = [
    new SystemMessage(case1.suspect.systemPrompt),
    ...history.slice(-20),
    ...factsNote,
    ...stateNote,
    new HumanMessage(userMessage),
  ];

  const { raw, parsed } = await model.invoke(messages);

  history.push(new HumanMessage(userMessage));
  history.push(new AIMessage(parsed.dialogue));

  if (Array.isArray(parsed.factsStated)) {
    for (const fact of parsed.factsStated) {
      const clean = fact.trim();
      if (clean) facts.add(clean);
    }
  }

  const usage = raw.response_metadata?.tokenUsage;
  const tokens = userTokens.get(userId);
  if (usage) {
    tokens.inputTokens += usage.promptTokens;
    tokens.outputTokens += usage.completionTokens;
  }

  const newStress = clampDelta(state.stress, parsed.stress, 20, 15);
  const newTrust = clampDelta(state.trust, parsed.trust, 15, 15);
  userLastState.set(userId, { stress: newStress, trust: newTrust });

  return {
    ...parsed,
    stress: newStress,
    trust: newTrust,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
  };
}

export function checkVerdict(verdict) {
  const correct = (verdict === "schuldig") === case1.suspect.guilty;
  return {
    correct,
    actuallyGuilty: case1.suspect.guilty,
    explanation: case1.suspect.guilty
      ? "Lars heeft het schilderij inderdaad gestolen. Hij had gokschulden en werd betaald door een onbekende afnemer."
      : "Lars was onschuldig. De dader was iemand anders die toegang had tot zijn alarm-code.",
  };
}

export function getPublicCase() {
  return {
    title: case1.title,
    briefing: case1.briefing,
    evidence: case1.evidence,
    suspect: {
      name: case1.suspect.name,
      role: case1.suspect.role,
      avatar: case1.suspect.avatar,
    },
  };
}
