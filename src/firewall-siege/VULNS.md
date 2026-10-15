# Firewall Siege — уязвимости и детект в Wazuh

Документ для портфолио: для каждой уязвимости — как эксплуатируется (взгляд
атакующего) и как ловится в SIEM (взгляд SOC). Приложение специально уязвимо;
ценность проекта — не в дырах, а в их детекте.

Все события пишутся в `logs/security.log` (JSON). Wazuh разбирает JSON сам;
кастомные правила ниже реагируют на поле `event` и назначают уровень.

---

## V1 — Клиентский счёт (broken trust boundary)

**Суть.** `POST /api/score` принимает `score` и `wave` с клиента и сохраняет без
проверки. Клиент — не доверенная сторона.

**Эксплуатация.** Открыть DevTools и отправить произвольный счёт:
```js
fetch("/api/score",{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({username:"neo",score:999999,wave:99})})
```
Игрок влетает на вершину таблицы, не играя.

**Детект.** Сервер считает достижимый максимум (10 волн × 500 ≈ 5000) и при
превышении пишет `event=score_anomaly severity=high`. Аномальный разрыв между
поданным и возможным счётом — сигнал подделки.

---

## V2 — SQL-инъекция в таблице рекордов

**Суть.** Параметры `sort`/`order` подставляются в `ORDER BY` строкой:
```
SELECT ... FROM scores GROUP BY username ORDER BY {sort} {order} LIMIT 20
```

**Эксплуатация.** Инъекция в позиции ORDER BY (boolean-blind через CASE):
```
/api/leaderboard?sort=(CASE WHEN (SELECT count(*) FROM players)>0 THEN score ELSE wave END)&order=desc
```
Меняя условие, атакующий по порядку строк вытягивает данные посимвольно
(наличие таблиц, длину/содержимое паролей и токенов из `players`). Проверочный
маркер инъекции: `?sort=score LIMIT 0--` возвращает пустой список вместо строк.

**Детект.** Эвристика по подозрительным токенам в параметрах (`'`, `--`, `union`,
`select`, `sleep`, `;`) → `event=sqli_attempt severity=critical`. Ошибки БД
(error-based) → `event=sqli_error severity=high`.

---

## V3 — IDOR (Insecure Direct Object Reference)

**Суть.** `GET /api/player/<id>` отдаёт профиль любого игрока по числовому id,
без проверки прав — включая пароль и токен сессии.

**Эксплуатация.** Перебор id = дамп всех аккаунтов:
```bash
for i in $(seq 1 50); do curl -s "http://siege.lab/api/player/$i?as=attacker"; done
```

**Детект.** Когда `requester ≠ владелец профиля` → `event=idor_access severity=high`.
Массовый перебор id с одного IP за короткое время — кандидат в корреляционное
правило (frequency).

---

## V4 — Слабый токен сессии

**Суть.** `token = sha1("siege-" + username)[:16]` — полностью выводится из имени.
Зная имя жертвы (а оно публично в таблице рекордов), атакующий вычисляет её токен
и выдаёт себя за неё.

**Эксплуатация.**
```bash
python3 -c "import hashlib;print(hashlib.sha1(b'siege-victim').hexdigest()[:16])"
```

**Детект.** Прямого лог-события нет (токен не «ломается» шумно). Ловится косвенно:
после подделки атакующий обращается к приватным действиям от чужого имени —
всплывает как аномалия в других правилах. Тема для методички: не всякая
уязвимость даёт явный лог, часть детектится по последствиям.

---

## V5 — Слабая авторизация админки

**Суть.** `GET /admin?key=letmein` защищён тривиальным ключом и сливает всю базу
(имена, пароли, токены).

**Эксплуатация.** Сканеры (nikto/dirb) находят `/admin`; ключ подбирается/утекает.
```
/admin?key=letmein
```

**Детект.** Любое обращение без валидного ключа → `event=admin_unauth severity=medium`
(типичный след сканера). Успешный вход → `event=admin_access severity=high`.
`/admin` работает и как honeypot-эндпоинт: легитимному игроку там делать нечего,
поэтому любой стук — подозрителен.

---

## Кастомные правила Wazuh

Декодер не нужен — лог уже JSON. Правила в
`/var/ossec/etc/rules/local_rules.xml` на менеджере (wazuh-soc):

```xml
<group name="firewall_siege,">
  <!-- базовое: любое событие нашего приложения -->
  <rule id="100200" level="3">
    <decoded_as>json</decoded_as>
    <field name="app">firewall-siege</field>
    <description>Firewall Siege: событие приложения</description>
  </rule>

  <rule id="100201" level="12">
    <if_sid>100200</if_sid>
    <field name="event">sqli_attempt</field>
    <description>Firewall Siege: попытка SQL-инъекции ($(param_sort))</description>
    <mitre><id>T1190</id></mitre>
  </rule>

  <rule id="100202" level="10">
    <if_sid>100200</if_sid>
    <field name="event">score_anomaly</field>
    <description>Firewall Siege: подделка счёта клиентом ($(username): $(score))</description>
    <mitre><id>T1565</id></mitre>
  </rule>

  <rule id="100203" level="10">
    <if_sid>100200</if_sid>
    <field name="event">idor_access</field>
    <description>Firewall Siege: доступ к чужому профилю (IDOR) от $(requester)</description>
    <mitre><id>T1087</id></mitre>
  </rule>

  <rule id="100204" level="8">
    <if_sid>100200</if_sid>
    <field name="event">admin_unauth</field>
    <description>Firewall Siege: обращение к /admin без ключа (скан?)</description>
    <mitre><id>T1595</id></mitre>
  </rule>

  <!-- корреляция: множественный IDOR с одного IP = перебор -->
  <rule id="100210" level="13" frequency="8" timeframe="30">
    <if_matched_sid>100203</if_matched_sid>
    <same_source_ip/>
    <description>Firewall Siege: массовый перебор профилей (IDOR bruteforce)</description>
    <mitre><id>T1087</id></mitre>
  </rule>
</group>
```

Проверка правила без реальной атаки — через `wazuh-logtest` на менеджере
(вставить одну JSON-строку из security.log).

---

## Сценарий демонстрации (атака с MSI → разбор в Wazuh)

1. С MSI по WireGuard открыть `siege.lab`, сыграть честно — базовый трафик.
2. Подделать счёт из DevTools → в панели Wazuh алерт 100202 (level 10).
3. Прогнать sqlmap/руками инъекцию по `?sort=` → алерт 100201 (critical).
4. Перебрать `/api/player/<id>` циклом → серия 100203 → корреляция 100210.
5. Постучать nikto/dirb → всплывут `/admin` (100204) и honeypot-эндпоинты.
6. В отчёте показать: что атакующий сделал, что увидел SOC, как правила
   отделили атаку от честной игры.
