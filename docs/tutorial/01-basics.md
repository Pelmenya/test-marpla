# Уровень 1 — Основы Flowise

## Базовые ноды

| Нода | Что делает | Ключевые параметры |
|------|-----------|-------------------|
| **Prompt Template** | Шаблон промпта с переменными `{var}` | `template`, `promptValues` |
| **ChatOpenAI** | Обёртка над OpenAI Chat API | `modelName`, `temperature`, `maxTokens`, `basePath` |
| **LLM Chain** | Связка Prompt + Model в единую цепочку | `chainName` |
| **Structured Output Parser** | Принудительный JSON-формат ответа | `jsonStructure`, `autofixParser` |

## Параметры ChatOpenAI

| Параметр | Что значит | Когда менять |
|----------|-----------|-------------|
| `modelName` | Какая модель (`gpt-4o-mini`, `gpt-4o`) | Mini для простых задач, полная для сложных |
| `temperature` | 0-2, креативность | 0.0 — детерминизм, 0.7 — копирайтинг, 1.5+ — творчество |
| `maxTokens` | Лимит токенов в ответе | Защита от runaway, считать под задачу |
| `basePath` | URL OpenAI-совместимого провайдера | Для прокси (Bothub, ProxyAPI) или локальных моделей (Ollama) |
| `streaming` | SSE-стриминг | ⚠️ Отключается автоматически если подключён Structured Output Parser |

## Structured Output Parser — как работает

```
1. Ты описываешь JSON-схему (поля, типы, описания)
2. Parser генерирует format_instructions текстом
3. Parser подставляет их в {format_instructions} промпта
4. LLM видит схему и генерирует JSON
5. Parser парсит ответ и валидирует
6. Если невалидно + autofix=true → повторный запрос к LLM
```

### Плюсы/минусы autofix

| + | − |
|---|---|
| Снижает процент невалидных JSON | 💰 Двойной расход токенов при ошибке |
| Автоматическое восстановление | ⚠️ Латентность удваивается |
| Меньше ошибок на клиенте | ⚠️ Ломает streaming |
| Нет ручной обработки ошибок | ⚠️ Маскирует проблемы промпта |

## LLM Chain: два выхода

| Выход | Что возвращает | Когда использовать |
|-------|---------------|--------------------|
| `LLMChain` | Инстанс цепочки (для streaming) | Финальная нода, нужен SSE |
| `Output Prediction` | Готовый результат (string/json) | Промежуточная нода, результат идёт дальше |

⚠️ **Ловушка:** Flowise валидирует что `outputs.output === data.name`. Если поменять вручную через БД — пиши просто `llmChain`, а не полный anchor ID.

## Prediction API

```json
POST /api/v1/prediction/{chatflowId}
{
  "question": "текст запроса",
  "overrideConfig": {
    "sessionId": "user-123",
    "basePath": "https://bothub.chat/api/v1/openai/v1",
    "temperature": 0.5
  },
  "streaming": true
}
```

### overrideConfig — что можно переопределить

| Параметр | Описание | Работает в v2.x? |
|----------|----------|-----------------|
| `basePath` | URL OpenAI-совместимого API | ✅ |
| `sessionId` | ID сессии для Memory | ✅ |
| `temperature`, `maxTokens` | Параметры модели | ✅ |
| `promptValues` | Переменные промпта | ❌ Не работает с LLM Chain |
| `vars` | Глобальные переменные Flowise | ✅ Требует "Allow Override" |

⚠️ **В Flowise 2.x `overrideConfig.promptValues` не работает с LLM Chain** — переменные передавай через `question` структурированным текстом.

## Streaming vs JSON

| Ситуация | Как работает |
|----------|-------------|
| Streaming: ON, без Parser | SSE-токены летят клиенту в реальном времени |
| Streaming: ON, с Parser | ❌ Парсер не может валидировать частичный JSON → streaming отключается |
| Streaming: OFF | Обычный JSON-ответ одним куском |

**Вывод:** Если нужен structured output — нет смысла включать streaming, всё равно отключится.

---

## Типовые кейсы

### Кейс 1 — Простая генерация текста (без JSON)

```
Prompt Template ──► ChatOpenAI ──► LLM Chain (output: llmChain)
```

**Используй когда:** нужен свободный текст, чат-ответ. Streaming работает.

### Кейс 2 — Structured Output (JSON по схеме)

```
Structured Output Parser ──┐
Prompt Template ───────────┼──► LLM Chain (output: llmChain)
ChatOpenAI ────────────────┘
```

**Используй когда:** нужен JSON с гарантированной структурой (API-ответы, извлечение данных).

### Кейс 3 — OpenAI через российский прокси

В ноде ChatOpenAI → Additional Parameters → **BasePath:**
- Bothub: `https://bothub.chat/api/v1/openai/v1`
- ProxyAPI: `https://api.proxyapi.ru/openai/v1`
- OpenRouter: `https://openrouter.ai/api/v1`

---

## Чек-лист проверки chatflow

- [ ] Нода ChatOpenAI имеет привязанный Credential
- [ ] В Prompt Template переменные `{var}` совпадают с переданными значениями
- [ ] В Structured Output Parser схема соответствует ожидаемому выходу бэкенда
- [ ] В LLM Chain output = `llmChain` (не `outputPrediction`) если нужен streaming
- [ ] BasePath указан если провайдер не openai.com
- [ ] Max Tokens установлены (защита от runaway)

## Частые ошибки и как чинить

| Ошибка | Причина | Решение |
|--------|---------|---------|
| "Output must be LLM Chain" | output = `outputPrediction` | Поменять на `llmChain` в UI или БД |
| Переменные `{product_name}` не подставляются | `overrideConfig.promptValues` не работает | Передавай данные через `question` |
| Стриминг не работает | Structured Output Parser отключает | Убери parser или забудь про streaming |
| `Please provide Prompt Values` | Пустые promptValues в ноде | Установи плейсхолдеры или убери переменные |
| HTTP 401 к Flowise | Нет авторизации | `FLOWISE_USERNAME` + `FLOWISE_PASSWORD` в env |
