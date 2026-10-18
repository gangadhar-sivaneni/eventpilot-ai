"""Registration agent. Runs on YOUR computer with a visible browser, for one registration at a time.

  python registration.py prepare <registration_id>   # read the form, propose answers, fill it for review
  python registration.py submit  <registration_id>   # after you approved on the website (ENABLE_SUBMIT=true)

Rules it never breaks: no CAPTCHA/queue bypass, no auto-accepting consent or legal declarations
(you tick those yourself on the website), no payment, no guessing (unmatched questions stop the run),
and no "success" without a confirmation signal from the form itself.
"""
import argparse
import os
import re
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

MIN_CONFIDENCE = 0.9
LOCK = timedelta(minutes=15)
PREPARABLE = ["not_started", "prepared", "awaiting_approval", "failed"]
MANUAL_KINDS = {"file", "payment", "unsupported"}  # always done by the user on the official page
CHOICE_KINDS = {"radio", "select", "checkbox"}

# Explicit label → profile field mapping, checked in order. Conservative: no match means "ask the user".
LABEL_RULES = [
    (r"\be-?mail\b", "email"),
    (r"\bfirst name\b", "first_name"),
    (r"\b(last name|surname)\b", "last_name"),
    (r"^(full )?name$|\bfull name\b|\byour name\b|\bname of (the )?(participant|student|applicant|candidate)\b", "full_name"),
    (r"\b(phone|mobile|contact number|whatsapp)\b", "phone"),
    (r"\b(date of birth|dob|birth ?date)\b", "date_of_birth"),
    (r"\bgender\b", "gender"),
    (r"\b(roll (no|number)|student id|registration number|hall ticket)\b", "student_id"),
    (r"\b(college|university|institute|institution|organi[sz]ation|company)\b", "organization"),
    (r"\b(branch|department|stream|major)\b", "department"),
    (r"\b(graduation year|year of graduation|passing year|pass ?out year)\b", "graduation_year"),
    (r"\bcity\b", "city"),
    (r"\bcountry\b", "country"),
    (r"\b(occupation|designation)\b", "occupation"),
    (r"\bgithub\b", "github_url"),
    (r"\blinkedin\b", "linkedin_url"),
    (r"\b(portfolio|personal website)\b", "portfolio_url"),
    (r"\b(resume|cv)\b", "resume_url"),
    (r"\b(t-?shirt|tee) size\b", "tshirt_size"),
]
CONSENT = re.compile(r"\b(agree|consent|terms|declar|code of conduct|privacy|accept|i confirm|i certify|undertake)", re.I)
PAYMENT = re.compile(r"\b(payment|transaction|utr|upi|card number|amount paid|receipt)\b", re.I)
GATEWAYS = re.compile(r"razorpay|paytm|payu|stripe|instamojo|cashfree|phonepe|paypal", re.I)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def pick_option(value: str, options: list[str]) -> str | None:
    """Exact option match ignoring case/punctuation ('non_binary' ~ 'Non-binary'), else None."""
    wanted = norm(value).replace(" ", "")
    return next((o for o in options if norm(o).replace(" ", "") == wanted), None)


def profile_value(key: str, profile: dict) -> str | None:
    if key in ("first_name", "last_name"):
        parts = (profile.get("full_name") or "").split()
        return (parts[0] if key == "first_name" else parts[-1]) if len(parts) >= 2 else None
    value = profile.get(key)
    return None if value in (None, "") else str(value)


def map_fields(fields: list[dict], profile: dict, answers: list[dict]) -> list[dict]:
    """Propose a value for every form field. Pure, so it is unit-tested without a browser or DB."""
    bank = {norm(a["question"]): a["answer"] for a in answers}
    items = []
    for f in fields:
        label, kind = f["label"], f["kind"]
        item = {**f, "form_kind": kind, "value": "", "source": "needs_user", "confidence": 0.0}
        if kind == "checkbox" and len(f.get("options") or []) <= 1 and CONSENT.search(label):
            item.update(kind="consent", source="consent")  # only you can agree to terms
        elif PAYMENT.search(label):
            item.update(kind="payment", source="manual")
        elif kind in MANUAL_KINDS:
            item["source"] = "manual"
        elif norm(label) in bank:
            item.update(value=bank[norm(label)], source="saved answer", confidence=0.95)
        else:
            key = next((k for pattern, k in LABEL_RULES if re.search(pattern, norm(label))), None)
            value = profile_value(key, profile) if key else None
            if key == "date_of_birth" and kind != "date":
                value = None  # unknown text date format: ask instead of guessing DD/MM vs MM/DD
            if value is not None and kind in CHOICE_KINDS:
                value = pick_option(value, f.get("options") or [])
            if value is not None:
                item.update(value=value, source=f"profile.{key}", confidence=1.0)
        if item["confidence"] < MIN_CONFIDENCE and item["source"] not in ("needs_user", "consent", "manual"):
            item.update(value="", source="needs_user")
        items.append(item)
    return items


def unresolved_labels(items: list[dict]) -> list[str]:
    """What still blocks approval. Re-checked before submit; the stored copy is never trusted."""
    out = []
    for i in items:
        if i["kind"] in MANUAL_KINDS:
            if i["required"]:
                out.append(f"{i['label']} (complete this on the official page)")
        elif i["kind"] == "consent":
            if i["required"] and i["value"] != "yes":
                out.append(f"{i['label']} (tick to agree on the website)")
        elif i["kind"] in CHOICE_KINDS and i["value"] and not all(pick_option(v, i.get("options") or []) for v in i["value"].split(";")):
            out.append(f"{i['label']} (value must be one of: {', '.join(i.get('options') or [])})")
        elif i["required"] and not i["value"]:
            out.append(i["label"])
    return out


# ───────────────────────── platform adapters ─────────────────────────

class LocalHtmlAdapter:
    """A plain HTML form you control (the test fixture): labelled inputs addressed by name."""
    READ = """() => {
      const form = document.querySelector('form'); if (!form) return [];
      const out = [], seen = new Set();
      for (const el of form.querySelectorAll('input, select, textarea')) {
        if (!el.name || seen.has(el.name) || ['hidden', 'submit', 'button'].includes(el.type)) continue;
        seen.add(el.name);
        const group = [...form.querySelectorAll(`[name="${el.name}"]`)];
        const fs = el.closest('fieldset');
        let kind = el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type;
        if (!['text','email','tel','url','number','date','textarea','select','radio','checkbox','file'].includes(kind)) kind = 'unsupported';
        const label = (kind === 'radio' || group.length > 1) && fs ? fs.querySelector('legend').innerText : (el.labels[0]?.innerText ?? el.name);
        const options = kind === 'select' ? [...el.options].filter(o => o.value).map(o => o.text.trim())
          : (kind === 'radio' || kind === 'checkbox') ? group.map(g => (g.labels[0]?.innerText ?? g.value).trim()) : [];
        out.push({label: label.replace(/\\*\\s*$/, '').trim(), kind, required: group.some(g => g.required), options, handle: el.name});
      }
      return out;
    }"""

    @staticmethod
    def handles(url: str) -> bool:
        return url.startswith("file://") or urlsplit(url).hostname in ("localhost", "127.0.0.1")

    def read_fields(self, page):
        return page.evaluate(self.READ)

    def fill(self, page, items):
        for i in items:
            loc = page.locator(f'[name="{i["handle"]}"]')
            if i["kind"] in ("radio", "checkbox"):
                for v in i["value"].split(";"):
                    exact = re.compile(rf"^\s*{re.escape(pick_option(v, i['options']))}\s*$")  # "Male" must not hit "Female"
                    page.locator(f'label:has([name="{i["handle"]}"])', has_text=exact).locator("input").check()
            elif i["kind"] == "consent":
                loc.first.check()
            elif i["kind"] == "select":
                loc.select_option(label=pick_option(i["value"], i["options"]))
            else:
                loc.fill(i["value"])

    def submit(self, page):
        page.locator('form [type="submit"]').click()

    def success(self, page) -> str | None:
        try:
            page.locator("#confirmation").wait_for(state="visible", timeout=10_000)
        except Exception:
            return None
        return page.locator("#confirmation").inner_text().strip()[:300]


class GoogleFormsAdapter:
    """Single-section Google Forms. Multi-section forms are reported as unsupported, not half-filled."""
    READ = """() => [...document.querySelectorAll('div[role=listitem]')].map((item, i) => {
      const heading = item.querySelector('[role=heading]'); if (!heading) return null;
      const text = heading.innerText.trim();
      const required = /\\*$/.test(text) || !!item.querySelector('[aria-label="Required question"]');
      const radios = [...item.querySelectorAll('[role=radio]')], checks = [...item.querySelectorAll('[role=checkbox]')];
      const listbox = item.querySelector('[role=listbox]');
      const opt = el => (el.getAttribute('data-value') ?? el.getAttribute('aria-label') ?? '').trim();
      let kind = 'unsupported', options = [];
      if (radios.length) { kind = 'radio'; options = radios.map(opt); }
      else if (checks.length) { kind = 'checkbox'; options = checks.map(opt); }
      else if (listbox) { kind = 'select'; options = [...item.querySelectorAll('[role=option]')].map(opt).filter(Boolean); }
      else if (item.querySelector('textarea')) kind = 'textarea';
      else if (item.querySelector('input[type=date]')) kind = 'date';
      else if (item.querySelector('input[type=email]')) kind = 'email';
      else if (item.querySelector('input[type=text], input[type=url], input[type=tel], input[type=number]')) kind = 'text';
      else if (/file/i.test(item.innerText) && item.querySelector('[role=button]')) kind = 'file';
      return {label: text.replace(/\\s*\\*$/, ''), kind, required, options, handle: String(i)};
    }).filter(Boolean)"""

    @staticmethod
    def handles(url: str) -> bool:
        parts = urlsplit(url)
        return parts.hostname in ("docs.google.com", "forms.gle") and (parts.path.startswith("/forms") or parts.hostname == "forms.gle")

    def read_fields(self, page):
        fields = page.evaluate(self.READ)
        if page.get_by_role("button", name=re.compile(r"^next$", re.I)).count():
            fields.append({"label": "Further form sections", "kind": "unsupported", "required": True, "options": [], "handle": "-1"})
        return fields

    def fill(self, page, items):
        for i in items:
            item = page.locator("div[role=listitem]").nth(int(i["handle"]))
            if i["kind"] == "radio":
                item.get_by_role("radio", name=pick_option(i["value"], i["options"]), exact=True).click()
            elif i["kind"] in ("checkbox", "consent"):
                boxes = [pick_option(v, i["options"]) for v in i["value"].split(";")] if i["kind"] == "checkbox" else [None]
                for name in boxes:
                    box = item.get_by_role("checkbox", name=name, exact=True) if name else item.get_by_role("checkbox").first
                    if box.get_attribute("aria-checked") != "true":
                        box.click()
            elif i["kind"] == "select":
                item.get_by_role("listbox").click()
                page.get_by_role("option", name=pick_option(i["value"], i["options"]), exact=True).last.click()
            else:
                item.locator("input:not([type=hidden]), textarea").first.fill(i["value"])

    def submit(self, page):
        page.get_by_role("button", name=re.compile(r"^submit$", re.I)).click()

    def success(self, page) -> str | None:
        try:
            page.wait_for_url(re.compile(r"/formResponse"), timeout=15_000)
        except Exception:
            return None
        if page.locator("div[role=listitem]").count():  # still showing questions = validation error
            return None
        return page.locator("body").inner_text().strip()[:300]


ADAPTERS = [GoogleFormsAdapter, LocalHtmlAdapter]


def pick_adapter(url: str):
    return next((a() for a in ADAPTERS if a.handles(url)), None)


class Paused(Exception):
    """Needs the user (sign-in, CAPTCHA, closed form). Status is left as it was."""


class FormChanged(Paused):
    """The live form no longer matches what the user approved: approval is withdrawn."""


def guard(page) -> None:
    host = urlsplit(page.url).hostname or ""
    if host == "accounts.google.com":
        raise Paused("Google sign-in required: sign in once in the opened browser window, then run prepare again")
    if page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"]').count():
        raise Paused("CAPTCHA on the page: complete the form yourself; the agent never solves CAPTCHAs")


def prepare_page(page, adapter, profile: dict, answers: list[dict]) -> tuple[list[dict], list[str]]:
    guard(page)
    fields = adapter.read_fields(page)
    if not fields:
        raise Paused("No form fields found. The form may be closed or not open yet")
    items = map_fields(fields, profile, answers)
    adapter.fill(page, [i for i in items if i["value"] and i["kind"] not in MANUAL_KINDS | {"consent"}])
    return items, unresolved_labels(items)


def fill_for_submit(page, adapter, items: list[dict]) -> None:
    guard(page)
    if [(f["label"], f["kind"]) for f in adapter.read_fields(page)] != [(i["label"], i["form_kind"]) for i in items]:
        raise FormChanged("The form changed since you approved it: prepare and approve again")
    adapter.fill(page, [i for i in items if i["value"] and (i["kind"] != "consent" or i["value"] == "yes")])
    guard(page)


# ───────────────────────── orchestration (DB + browser) ─────────────────────────

@contextmanager
def browser(headless: bool = False):
    from playwright.sync_api import sync_playwright
    profile_dir = os.environ.get("BROWSER_PROFILE_DIR") or str(Path(__file__).with_name(".browser-profile"))
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(profile_dir, headless=headless, channel=os.environ.get("BROWSER_CHANNEL") or None)
        try:
            yield ctx.pages[0] if ctx.pages else ctx.new_page()
        finally:
            ctx.close()


def claim(reg_id: int, statuses: list[str]) -> dict | None:
    import db
    now = db.now()
    rows = db.client().table("registrations").update({"locked_until": db.iso(now + LOCK)}).eq("id", reg_id) \
        .in_("status", statuses).or_(f'locked_until.is.null,locked_until.lt."{db.iso(now)}"').execute().data
    return rows[0] if rows else None


def context(reg: dict) -> tuple[dict, dict, list[dict]]:
    import db
    c = db.client()
    event = c.table("events").select("id, title, url, registration_url, fee_status, fee_amount").eq("id", reg["event_id"]).single().execute().data
    profile = c.table("profiles").select("*").eq("user_id", reg["user_id"]).single().execute().data
    answers = c.table("registration_answers").select("question, answer").eq("user_id", reg["user_id"]).execute().data
    return event, profile, answers


def save(reg: dict, **fields) -> None:
    import db
    db.client().table("registrations").update({"locked_until": None, **fields}).eq("id", reg["id"]).execute()


def prepare(reg_id: int, wait: bool = True) -> None:
    import db
    reg = claim(reg_id, PREPARABLE)
    if not reg:
        raise SystemExit("Registration not found, locked by another run, or already submitted")
    attempts = reg["attempt_count"] + 1
    try:
        event, profile, answers = context(reg)
        url = event["registration_url"] or event["url"]
        adapter = pick_adapter(url)
        if not adapter:
            save(reg, status="failed", attempt_count=attempts,
                 error_summary=f"Unsupported form platform. Register on the official page: {url}")
            print("Unsupported form platform; marked failed with a link to the official page")
            return
        with browser() as page:
            page.goto(url, wait_until="networkidle")
            items, unresolved = prepare_page(page, adapter, profile, answers)
            status = "prepared" if unresolved else "awaiting_approval"
            save(reg, status=status, proposed_answers=items, unresolved_fields=unresolved, approved_at=None,
                 approved_fee_amount=None, error_summary=None, attempt_count=attempts)
            db.audit("registration_prepared", reg["user_id"], registration_id=reg_id, fields=len(items), unresolved=len(unresolved))
            print(f"{status}: {len(items)} fields, {len(unresolved)} need you")
            for u in unresolved:
                print(f"  - {u}")
            if wait:
                input("Check the filled form in the browser window, then press Enter to close it… ")
    except Paused as p:
        save(reg, attempt_count=attempts, error_summary=str(p))
        print(f"Paused: {p}")
    except Exception as err:
        save(reg, status="failed", attempt_count=attempts, error_summary=f"{type(err).__name__}: {str(err)[:300]}")
        raise


def submit(reg_id: int, wait: bool = True) -> None:
    import db
    if os.environ.get("ENABLE_SUBMIT") != "true":
        raise SystemExit("Submission is disabled. Set ENABLE_SUBMIT=true only after testing on a form you control")
    # "prepared" counts too: the user may have answered the flagged questions on the website, then approved
    reg = claim(reg_id, ["prepared", "awaiting_approval"])
    if not reg:
        raise SystemExit("Not ready to submit (or locked). Submitted registrations are never re-sent automatically")
    attempts, submitted = reg["attempt_count"] + 1, False
    try:
        event, _, _ = context(reg)
        items = reg["proposed_answers"]
        problems = unresolved_labels(items)
        if not reg["approved_at"] or problems:
            raise Paused("Approve on the website first" if not reg["approved_at"] else f"Unresolved: {problems}")
        if event["fee_status"] != "free":
            fee_ok = reg["approved_fee_amount"] is not None and (
                event["fee_amount"] is None or float(event["fee_amount"]) == float(reg["approved_fee_amount"]))
            if not fee_ok:
                raise Paused("The fee you approved does not match the event fee")
        url = event["registration_url"] or event["url"]
        adapter = pick_adapter(url)
        with browser() as page:
            page.goto(url, wait_until="networkidle")
            fill_for_submit(page, adapter, items)
            # write-ahead: from here a crash leaves "submitted", which is never retried blindly
            save(reg, status="submitted", submitted_at=db.iso(db.now()), attempt_count=attempts, error_summary=None,
                 locked_until=db.iso(db.now() + LOCK))
            submitted = True
            adapter.submit(page)
            evidence = adapter.success(page)
            if evidence:
                save(reg, status="confirmed", evidence=evidence)
            elif GATEWAYS.search(page.url):
                save(reg, error_summary="Reached a payment page. Complete payment yourself; status stays submitted")
            else:
                save(reg, status="unknown", error_summary="No confirmation signal after submit. Check your email; not resubmitting")
            db.audit("registration_submitted", reg["user_id"], registration_id=reg_id, confirmed=bool(evidence))
            print("confirmed" if evidence else "submitted without confirmation: check your email and the event page")
            if wait:
                input("Press Enter to close the browser… ")
    except Paused as p:
        fields = {"error_summary": str(p)}
        if not submitted:
            fields["attempt_count"] = attempts
        if isinstance(p, FormChanged):
            fields.update(status="prepared", approved_at=None)
        save(reg, **fields)
        print(f"Paused: {p}")
    except Exception as err:
        save(reg, **({} if submitted else {"attempt_count": attempts}), error_summary=f"{type(err).__name__}: {str(err)[:300]}")
        raise


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=["prepare", "submit"])
    ap.add_argument("registration_id", type=int)
    ap.add_argument("--no-wait", action="store_true", help="close the browser without waiting for Enter")
    args = ap.parse_args()
    (prepare if args.action == "prepare" else submit)(args.registration_id, wait=not args.no_wait)
