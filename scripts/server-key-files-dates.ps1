# Выводит дату/время ключевых файлов на сервере для подвала отчёта.
# Запуск: .\scripts\server-key-files-dates.ps1
# Требует: scripts/server-key-files-dates.sh на сервере (деплоится с проектом).
ssh hoster "cd ~/komissionka && bash scripts/server-key-files-dates.sh"
