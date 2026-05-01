# AI Interrogation Game

Detective-simulatie waarin je een verdachte verhoort. Het taalmodel speelt de rol van de verdachte en geeft via structured output zijn dialoog, lichaamstaal, stress- en vertrouwensniveau terug.

Eindopdracht 1 voor CMTPRG02-8 Smart Technologies.

## Install

```bash
npm install
```

Kopieer `.env.example` naar `.env` en vul je Azure OpenAI keys in.

## Run

```bash
npm start
```

Open http://localhost:3000

## Live

(link naar deployed versie komt hier)

## Features

- **Structured output** (Zod + `withStructuredOutput`) — de AI geeft een JSON-object terug met dialogue, bodyLanguage, microExpression, stress, trust, newClue
- **Chat history per user** — elke browser krijgt een eigen `userId` via `crypto.randomUUID()`, server houdt per user een eigen messages-array bij in een `Map`
- **Token usage** — input en output tokens worden per beurt getoond
