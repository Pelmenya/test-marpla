# Уровень 5 — Агенты

## Что такое Tool Agent

До этого LLM была "текстовой функцией": дал промпт → получил текст.

**Tool Agent = LLM которая:**
1. **Понимает** что нужно сделать
2. **Сама решает** какой инструмент вызвать
3. **Видит результат** и может вызвать ещё
4. **Формирует финальный ответ** на основе полученных данных

Это переход от генерации к **действию**.

## Цикл работы Tool Agent

```
User: "Сколько у нас товаров?"
  ↓
LLM думает: "Нужны данные из БД"
  ↓
LLM вызывает tool: query(sql="SELECT COUNT(*) FROM products")
  ↓
Tool возвращает: [{"count": 57}]
  ↓
LLM формирует ответ: "В базе 57 товаров"
```

На каждом шаге LLM **сама решает** — нужен tool или можно отвечать.

---

## Типы агентов в Flowise 3.1.2

| Агент | Когда использовать |
|-------|-------------------|
| **Tool Agent** | 🔥 Универсальный, по умолчанию |
| **OpenAI Tool Agent** | Заточен под OpenAI (parallel tool calls) |
| **OpenAI Function Agent** | Старый стандарт, до parallel tools |
| **MistralAI Tool Agent** | Для Mistral моделей |
| **ReAct Agent** | "Reasoning + Action" — пошагово рассуждает вслух |
| **Conversational Agent** | Tool Agent + диалог (memory автоматически) |
| **Conversational Retrieval Agent** | Tool Agent + RAG + memory |
| **CSV Agent** | Специализирован под анализ CSV |
| **OpenAI Assistant** | Использует нативные OpenAI Assistants API |
| **XML Agent** | Для Claude (Anthropic предпочитает XML) |
| **AutoGPT / BabyAGI** | Автономные, экспериментальные |

**Универсальный выбор: Tool Agent.**

---

## Обязательные компоненты Tool Agent

```
┌─── Tool Agent ───┐
│                  │
│  ← Chat Model    │  LLM-мозг (ChatOpenAI, Claude и т.д.)
│  ← Tools         │  Инструменты (MCP, Custom Tool, API)
│  ← Memory        │  ⚠️ Обязательно в 3.x (даже пустая Buffer Memory)
│                  │
└──────────────────┘
```

⚠️ **Подвох Flowise 3.x:** Memory помечена как опциональная, но **без неё Tool Agent падает** с ошибкой `memory.getChatMessages is not a function`. Всегда подключай хотя бы Buffer Memory.

---

## MCP (Model Context Protocol)

### Что это

**MCP — открытый стандарт от Anthropic для подключения tools к LLM.**

- До MCP: каждый фреймворк имел свой формат (OpenAI tools, Flowise Custom Tool, LangChain tool)
- С MCP: универсальный протокол — **"USB для AI"**
- Один MCP-сервер работает с любым MCP-клиентом (Claude Desktop, Flowise, Cursor, Zed, и т.д.)

### Архитектура

```
        ┌── AI-агент (Claude/GPT/Ollama) ──┐
        │         рассуждает, решает       │
        └─────────────┬────────────────────┘
                      │
                 MCP протокол
                      │
      ┌───────────────┼───────────────┐
      │               │               │
┌─────▼─────┐  ┌──────▼──────┐  ┌─────▼─────┐
│ mcp-fs    │  │mcp-postgres │  │ твой MCP  │
│ (файлы)   │  │ (БД)        │  │ (API)     │
└───────────┘  └─────────────┘  └───────────┘
```

### Готовые MCP в Flowise 3.1.2

| MCP | Что даёт |
|-----|----------|
| **Custom MCP** | 🎯 Подключение любого MCP-сервера |
| **PostgreSQL MCP** | SELECT-запросы к PostgreSQL |
| **Slack MCP** | Отправка/чтение Slack |
| **GitHub MCP** | Работа с репозиториями |
| **Browserless MCP** | Headless-браузер, скрейпинг |
| **Brave Search MCP** | Веб-поиск |
| **Pipedream MCP** | 2000+ интеграций через Pipedream |
| **Teradata MCP** | Корпоративная аналитика |
| **Supergateway MCP** | Прокси stdio ↔ HTTP/SSE |
| **Sequential Thinking MCP** | Пошаговое рассуждение |

---

## Практика — Postgres MCP + Tool Agent

### Структура флоу

```
ChatOpenAI ──────────┐
                      │
PostgreSQL MCP ──────┼──► Tool Agent
                      │
Buffer Memory ───────┘
```

### Настройка PostgreSQL MCP

1. **Credential** → создать новый
2. **Postgres URL** (одно поле):
   ```
   postgresql://user:pass@host:port/database
   ```
3. **Available Actions** → `query run read-only`

⚠️ **Подводные камни URL:**

| Ошибка | Симптом |
|--------|---------|
| Пробел в начале URL | `getaddrinfo EAI_AGAIN <что-то>` |
| Забыт порт | `connection refused` |
| Неправильный хост | `getaddrinfo ENOTFOUND` |
| Неправильный пароль | `password authentication failed` |
| Хост `localhost` из Docker | Не резолвится — используй имя контейнера |

**Правильный хост = имя контейнера** (если Flowise и Postgres в одной docker-сети).

### System Message — важно

Агенту нужна **схема БД** в инструкциях, иначе он будет угадывать названия таблиц:

```
Схема БД:
- categories(id, name, parent_id)
- sellers(id, name, rating, total_sales)
- products(id, name, description, price, category_id, seller_id, rating, review_count, stock)
- reviews(id, product_id, rating, comment, created_at)
- orders(id, product_id, quantity, total_price, status, created_at)

Views для удобства:
- products_with_details (товар + категория + селлер)
- top_sellers (селлеры с агрегацией)
- category_stats (статистика по категориям)

Правила:
- Используй SELECT для получения данных
- Для товаров с названиями продавцов — используй view products_with_details
- Отвечай на русском
- Всегда указывай единицы измерения в выводе
```

### Readonly user — защита

Давать агенту **read-only пользователя**, не write-доступ:

```sql
CREATE USER agent_readonly WITH PASSWORD 'xxx';
GRANT CONNECT ON DATABASE mydb TO agent_readonly;
GRANT USAGE ON SCHEMA public TO agent_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_readonly;
```

Попытка агента сделать `INSERT`/`UPDATE` даст ошибку, которую он увидит и поймёт что нельзя.

---

## Граница возможностей Tool Agent

### Что агент делает хорошо

- ✅ Корректный SQL с JOIN, GROUP BY
- ✅ Агрегации, фильтры, сортировка
- ✅ Многошаговые запросы (2-4 вызова подряд)
- ✅ Бизнес-интерпретация результатов

### Что делает плохо

- ❌ Расплывчатые вопросы ("какие товары проблемные?") — склонен к галлюцинациям
- ❌ Слишком строгие AND-условия → пустой результат → "всё ок"
- ❌ Не копает глубже при первом пустом ответе
- ❌ Не использует views автоматически если не указать
- ❌ Может забыть JOIN и отвечать id вместо названий

### Лечение

1. **Чёткий system message** — критерии, схема, примеры запросов
2. **Разбивка задачи** — "проверь X, потом Y, потом Z, потом дай вывод"
3. **Критик-модель** — второй LLM проверяет ответ первого (Multi-Agent паттерн)
4. **Structured Output** — JSON со списком, не текст
5. **Метрики качества** — тестовые вопросы с известными ответами

---

## Типовые проблемы и отладка

### 1. `memory.getChatMessages is not a function`

Подключи **Buffer Memory** к Tool Agent (даже если "не нужна").

### 2. Агент отвечает из головы, не вызывает tools

**Причина:** system message не указывает что нужно использовать tools.

**Решение:** добавь явную инструкцию:
```
Всегда используй query tool для получения данных.
Не отвечай из своих знаний, только из БД.
```

### 3. Агент делает один запрос и сдаётся

**Причина:** `Max Iterations = 1` в настройках Tool Agent.

**Решение:** увеличь до 5-10.

### 4. `getaddrinfo` ошибки

**Причина:** неправильный хост в URL (пробелы, опечатки, `localhost` из Docker).

**Решение:** проверь строку подключения символ за символом.

### 5. Агент использует `SELECT *` и возвращает много мусора

**Причина:** не указано какие поля нужны.

**Решение:** в system message — "Выбирай только нужные поля, не используй SELECT *".

---

## Инструменты отладки

### Executions (только в 3.x)

Сайдбар → **Executions** → список всех запусков с:
- Вопросом пользователя
- Used Tools (список вызовов)
- Tool Input (SQL или аргументы)
- Tool Output (результат)
- Финальный ответ

**Смотри каждый провалившийся запуск — это главный инструмент понимания агента.**

### Docker logs

```bash
docker logs flowise-tutorial --tail 50 --follow
```

Видны все ошибки, в том числе MCP connection errors.

### Прямая проверка БД

```bash
docker exec postgres-tutorial psql -U tutorial_user -d tutorial_db -c "SQL..."
```

Чтобы сравнить ответ агента с "правдой".

---

## Практические задания

Для каждого — проверь в Executions какой SQL сгенерировался.

### Базовые

1. "Сколько у нас товаров?"
2. "Покажи топ-5 самых дорогих товаров"
3. "Сколько товаров в категории Смартфоны?"

### Средние

4. "Какой продавец заработал больше всего по доставленным заказам?"
5. "Покажи товары без единого отзыва"
6. "Средняя цена по каждой категории"

### Сложные

7. "Какие товары могут закончиться если спрос сохранится?"
8. "Проверь качество каталога по 4 критериям (...)"
9. "Найди проблемных селлеров" (расплывчато — смотрим как интерпретирует)

### Итого

После всех этих заданий ты:
- Знаешь цикл Tool Agent
- Понимаешь MCP и как он соединяет LLM с БД
- Видел что агент делает хорошо, а что плохо
- Умеешь отлаживать через Executions
- Готов применять в своих задачах

---

## Что дальше

- **Custom Tool** — свой JS-код вместо MCP (для кастомной бизнес-логики)
- **Несколько tools одновременно** — агент с доступом к БД + Web Search + своим API
- **Conversational Retrieval Agent** — агент + RAG (на документах из Document Stores)
- **Multi-Agent** — несколько агентов работают вместе (Уровень 6)

---

## Заметки

<!-- Здесь можно записывать свои наблюдения: какие промпты работают, какие нет, сколько стоит запрос и т.д. -->
