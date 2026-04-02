#!/bin/bash
# Импорт chatflow в Flowise через Settings → Import
# Использование: выполнить после первого запуска docker-compose up -d
#
# 1. Откройте Flowise UI: http://localhost:${FLOWISE_PORT:-3030}
# 2. Пройдите начальную регистрацию (создайте аккаунт)
# 3. Создайте Credential: Credentials → Add New → OpenAI API → вставьте API Key
#    В Additional Parameters → BasePath укажите URL вашего провайдера
#    (например: https://bothub.chat/api/v1/openai/v1)
# 4. Settings (шестерёнка) → Import → выберите файл flowise/ExportData.json
# 5. Откройте импортированный chatflow "SEO Description Generator"
# 6. В ноде ChatOpenAI выберите созданный Credential → Save
# 7. Скопируйте ID chatflow из URL и вставьте в .env (FLOWISE_CHATFLOW_ID)
# 8. Перезапустите backend: docker-compose restart backend

set -e

FLOWISE_PORT="${FLOWISE_PORT:-3030}"
FLOWISE_URL="http://localhost:${FLOWISE_PORT}"

echo "Ожидание запуска Flowise на ${FLOWISE_URL}..."
for i in $(seq 1 30); do
  if curl -s --noproxy '*' "${FLOWISE_URL}/api/v1/ping" 2>/dev/null | grep -q "pong"; then
    echo "Flowise готов!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Flowise не запустился за 30 секунд. Проверьте docker-compose logs flowise"
    exit 1
  fi
  sleep 1
done

echo ""
echo "=== Инструкция по настройке ==="
echo ""
echo "1. Откройте ${FLOWISE_URL} в браузере"
echo "2. Создайте аккаунт (первый запуск)"
echo "3. Credentials → Add New → OpenAI API → вставьте API Key"
echo "   В Additional Parameters → BasePath: URL вашего OpenAI-совместимого провайдера"
echo "4. Settings (⚙) → Import → выберите flowise/ExportData.json"
echo "5. Откройте chatflow → в ноде ChatOpenAI выберите Credential → Save"
echo "6. Скопируйте ID chatflow из URL (после /chatflows/)"
echo "7. Вставьте ID в .env: FLOWISE_CHATFLOW_ID=<ваш_id>"
echo "8. docker-compose restart backend"
echo ""
echo "После этого API доступен: POST http://localhost:${BACKEND_PORT:-3001}/api/generate-seo"
