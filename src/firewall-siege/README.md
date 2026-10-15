# Firewall Siege

Браузерная tower-defense в сеттинге сетевой защиты, написана как **намеренно
уязвимая мишень** для SOC-лабы. Игрок ставит защитные узлы и отбивает волны
«вредоносных пакетов». Вокруг игры — набор классических веб-уязвимостей, на
которых тренируется детект в Wazuh.

> Только приватная лаба. НЕ публиковать в интернет.

Оригинальная разработка: графика рисуется примитивами (круги = пакеты,
квадраты = узлы), ассеты и названия свои.

## Стек
- Backend: Flask + SQLite (`app.py`, `schema.sql`)
- Frontend: HTML5 canvas + ванильный JS (`templates/`, `static/`)
- Порт 5001 (рядом с notes_app на 5000), за nginx на web-dmz
- Лог безопасности: `logs/security.log` — JSON-строки для агента Wazuh

## Уязвимости (подробно — в VULNS.md)
| ID | Уязвимость | Эндпоинт | severity в логе |
|----|-----------|----------|-----------------|
| V1 | Клиентский счёт без проверки | `POST /api/score` | high (аномалия) |
| V2 | SQL-инъекция (ORDER BY) | `GET /api/leaderboard?sort=` | critical |
| V3 | IDOR (чужой профиль по id) | `GET /api/player/<id>` | high |
| V4 | Слабый токен (функция от имени) | `POST /api/register`,`/login` | — |
| V5 | Слабая авторизация админки | `GET /admin?key=` | medium/high |

## Локальный запуск (для разработки)
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py          # http://localhost:5001
```

## Деплой на web-dmz (как notes_app)

1. Скопировать проект и поставить зависимости:
```bash
scp -r firewall-siege webadmin@10.10.20.10:~/
ssh webadmin@10.10.20.10
cd ~/firewall-siege
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py            # проверить, что поднялось на :5001, затем Ctrl+C
```

2. systemd-сервис `/etc/systemd/system/firewall-siege.service`:
```ini
[Unit]
Description=Firewall Siege (vulnerable lab target)
After=network.target
[Service]
User=webadmin
WorkingDirectory=/home/webadmin/firewall-siege
ExecStart=/home/webadmin/firewall-siege/venv/bin/python /home/webadmin/firewall-siege/app.py
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now firewall-siege
```

3. nginx — отдать игру на отдельном хосте `siege.lab` (или location `/siege`).
   Пример отдельного server-блока (по образцу notes.lab), проксируем на :5001,
   `X-Real-IP`/`X-Forwarded-For` обязательно (иначе в логах будет IP nginx):
```nginx
location / {
    proxy_pass http://127.0.0.1:5001;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
   DNS: добавить `siege.lab → 10.10.20.10` в Unbound override (как notes.lab).

## Подключение лога к Wazuh (агент на web-dmz)

Добавить в `/var/ossec/etc/ossec.conf` агента блок localfile:
```xml
<localfile>
  <log_format>json</log_format>
  <location>/home/webadmin/firewall-siege/logs/security.log</location>
</localfile>
```
Затем `sudo systemctl restart wazuh-agent`. Wazuh автоматически разберёт JSON:
поля `event`, `severity`, `src_ip`, `username` и т.д. станут доступны в
alerts/поиске. Кастомные правила детекта (по `event`) — в VULNS.md.

Права: агент Wazuh (root) читает файл; каталог `logs/` должен быть доступен на
чтение. При необходимости `chmod 644 logs/security.log`.
