"""
Firewall Siege — намеренно уязвимая браузерная tower-defense для SOC-лабы.

НАЗНАЧЕНИЕ: мишень (арена) для генерации атак и их детекта в Wazuh.
НЕ выкладывать в интернет. Только приватная лаба.

Уязвимости встроены СПЕЦИАЛЬНО (см. VULNS.md):
  V1  клиентский счёт очков   — /api/score принимает score без серверной проверки
  V2  SQL-инъекция           — /api/leaderboard, параметр sort/order в ORDER BY
  V3  IDOR                    — /api/player/<id> отдаёт чужой профиль (в т.ч. токен)
  V4  слабая аутентификация  — токен сессии = предсказуемая функция от имени
  V5  слабая авторизация      — /admin доступен по тривиальному ключу

Каждое событие пишется JSON-строкой в logs/security.log — этот файл подхватывает
агент Wazuh (localfile, формат json) для правил детекта.
"""

import json
import hashlib
import sqlite3
import datetime
from pathlib import Path
from flask import Flask, request, jsonify, render_template, g

BASE = Path(__file__).parent
DB_PATH = BASE / "siege.db"
SEC_LOG = BASE / "logs" / "security.log"

# Теоретический максимум очков за волну — для флага аномалии в логе.
# (сервер всё равно принимает любой score — это и есть уязвимость V1;
#  детект аномалии делается в SIEM, а не в приложении)
MAX_WAVES = 10
PLAUSIBLE_SCORE_PER_WAVE = 500
PLAUSIBLE_MAX_SCORE = MAX_WAVES * PLAUSIBLE_SCORE_PER_WAVE  # 5000

app = Flask(__name__)


# ---------- база ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    con = sqlite3.connect(DB_PATH)
    con.executescript((BASE / "schema.sql").read_text())
    con.commit()
    con.close()


# ---------- логирование безопасности (для Wazuh) ----------
def client_ip():
    # nginx проксирует реальный IP в X-Real-IP / X-Forwarded-For
    return (
        request.headers.get("X-Real-IP")
        or (request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or None)
        or request.remote_addr
    )


def log_security(event, severity="info", **fields):
    """Пишет одно событие JSON-строкой в security.log (декодируется Wazuh)."""
    entry = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "app": "firewall-siege",
        "event": event,
        "severity": severity,          # info | low | medium | high | critical
        "src_ip": client_ip(),
        "path": request.path,
        "method": request.method,
        "user_agent": request.headers.get("User-Agent", ""),
    }
    entry.update(fields)
    SEC_LOG.parent.mkdir(exist_ok=True)
    with open(SEC_LOG, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ---------- слабый токен (V4) ----------
def weak_token(username):
    """
    УЯЗВИМОСТЬ V4: токен полностью выводится из имени пользователя.
    Зная имя, атакующий вычисляет чужой токен → подделка сессии.
    (в норме токен должен быть случайным и несвязанным с именем)
    """
    return hashlib.sha1(("siege-" + username).encode()).hexdigest()[:16]


# ---------- страницы ----------
@app.route("/")
def index():
    return render_template("index.html")


# ---------- API: регистрация / вход ----------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify(error="username and password required"), 400

    db = get_db()
    exists = db.execute("SELECT 1 FROM players WHERE username = ?", (username,)).fetchone()
    if exists:
        return jsonify(error="username taken"), 409

    token = weak_token(username)
    # пароль хранится в открытом виде — ещё одна учебная слабость (можно детектить утечку)
    db.execute(
        "INSERT INTO players (username, password, token, created_at) VALUES (?, ?, ?, ?)",
        (username, password, token, datetime.datetime.utcnow().isoformat()),
    )
    db.commit()
    log_security("auth_register", severity="low", username=username)
    return jsonify(username=username, token=token)


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    db = get_db()
    row = db.execute("SELECT * FROM players WHERE username = ?", (username,)).fetchone()
    if not row or row["password"] != password:
        log_security("auth_fail", severity="medium", username=username)
        return jsonify(error="invalid credentials"), 401
    log_security("auth_login", severity="info", username=username)
    return jsonify(username=username, token=row["token"])


# ---------- API: отправка результата (V1) ----------
@app.route("/api/score", methods=["POST"])
def submit_score():
    """
    УЯЗВИМОСТЬ V1: score/wave/credits приходят с клиента и принимаются БЕЗ ПРОВЕРКИ.
    Читер шлёт любое число. Сервер сохраняет как есть.
    Детект — в SIEM: помечаем аномалию флагом, но всё равно сохраняем (уязвимость).
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "anon").strip()
    try:
        score = int(data.get("score", 0))
        wave = int(data.get("wave", 0))
    except (TypeError, ValueError):
        return jsonify(error="bad score"), 400

    anomalous = score > PLAUSIBLE_MAX_SCORE or wave > MAX_WAVES or score < 0
    db = get_db()
    db.execute(
        "INSERT INTO scores (username, score, wave, created_at) VALUES (?, ?, ?, ?)",
        (username, score, wave, datetime.datetime.utcnow().isoformat()),
    )
    db.commit()

    if anomalous:
        # score вне возможного диапазона → почти наверняка подделка клиента
        log_security(
            "score_anomaly", severity="high",
            username=username, score=score, wave=wave,
            plausible_max=PLAUSIBLE_MAX_SCORE,
            reason="score/wave вне достижимого диапазона (вероятная подделка клиента)",
        )
    else:
        log_security("score_submit", severity="info",
                     username=username, score=score, wave=wave)
    return jsonify(ok=True, saved=score, flagged=anomalous)


# ---------- API: таблица рекордов (V2 — SQL-инъекция) ----------
@app.route("/api/leaderboard")
def leaderboard():
    """
    УЯЗВИМОСТЬ V2: параметры sort/order подставляются в ORDER BY строкой (f-string),
    без параметризации и белого списка → классическая SQL-инъекция.
    """
    sort = request.args.get("sort", "score")
    order = request.args.get("order", "desc")

    # эвристика для лога: подозрительные символы/ключевые слова в параметрах
    raw = f"{sort} {order}"
    suspicious = any(t in raw.lower() for t in
                     ["'", "--", ";", "union", "select", "sleep", "/*", " or ", "="])
    if suspicious:
        log_security("sqli_attempt", severity="critical",
                     param_sort=sort, param_order=order,
                     reason="паттерн SQL-инъекции в параметрах сортировки")

    db = get_db()
    # УЯЗВИМАЯ строка — специально без параметров:
    query = f"SELECT username, MAX(score) AS score, MAX(wave) AS wave FROM scores GROUP BY username ORDER BY {sort} {order} LIMIT 20"
    try:
        rows = db.execute(query).fetchall()
    except sqlite3.Error as e:
        # ошибка БД в ответе — помогает атакующему (error-based) и годится для детекта
        log_security("sqli_error", severity="high",
                     param_sort=sort, param_order=order, db_error=str(e))
        return jsonify(error=f"db error: {e}", query=query), 500
    return jsonify([dict(r) for r in rows])


# ---------- API: профиль игрока (V3 — IDOR) ----------
@app.route("/api/player/<int:pid>")
def player(pid):
    """
    УЯЗВИМОСТЬ V3: отдаёт полный профиль ЛЮБОГО игрока по id, без проверки прав,
    включая токен сессии и пароль. Перебор id = дамп всех аккаунтов.
    """
    requester = request.args.get("as") or "anon"
    db = get_db()
    row = db.execute("SELECT id, username, password, token FROM players WHERE id = ?", (pid,)).fetchone()
    if not row:
        return jsonify(error="not found"), 404
    # requester не совпадает с владельцем → подозрительный доступ (для детекта)
    if requester != row["username"]:
        log_security("idor_access", severity="high",
                     requester=requester, target_id=pid, target_user=row["username"],
                     reason="доступ к чужому профилю по id")
    return jsonify(dict(row))


# ---------- /admin (V5 — слабая авторизация) ----------
@app.route("/admin")
def admin():
    """
    УЯЗВИМОСТЬ V5: «админка» защищена тривиальным ключом в query (?key=letmein).
    Любой доступ логируется — типичная honeypot-точка для сканеров.
    """
    key = request.args.get("key", "")
    if key != "letmein":
        log_security("admin_unauth", severity="medium",
                     reason="обращение к /admin без валидного ключа", supplied_key=key)
        return jsonify(error="forbidden"), 403
    log_security("admin_access", severity="high", reason="вход в админку по слабому ключу")
    db = get_db()
    rows = db.execute("SELECT id, username, password, token FROM players").fetchall()
    return jsonify(players=[dict(r) for r in rows])


if __name__ == "__main__":
    init_db()
    # порт 5001 — рядом с notes_app (5000), оба за nginx на web-dmz
    app.run(host="0.0.0.0", port=5001, debug=True)
