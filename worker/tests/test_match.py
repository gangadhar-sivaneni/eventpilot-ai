from datetime import datetime, timezone

from match_users import build_alerts, downgrade, matches

NOW = datetime(2026, 10, 18, tzinfo=timezone.utc)
PREFS = {"user_id": "u1", "categories": [], "countries": [], "cities": [], "formats": [], "max_fee": None, "prize_only": False,
         "alert_new_event": True, "alert_registration_opened": True, "alert_deadline_reminder": True, "alert_availability_changed": True}


def ev(**kw):
    return {"id": 1, "title": "AI Hackathon", "categories": ["hackathon"], "country": "India", "city": "Hyderabad",
            "format": "in_person", "fee_status": "free", "fee_amount": 0, "prize_text": None,
            "registration_status": "open", "registration_deadline": None, **kw}


def test_filters():
    assert matches(PREFS, ev(), NOW)
    assert matches({**PREFS, "categories": ["ai"]}, ev(), NOW)  # word in title counts
    assert not matches({**PREFS, "categories": ["music"]}, ev(), NOW)
    assert not matches({**PREFS, "cities": ["Pune"]}, ev(), NOW)
    assert matches({**PREFS, "cities": ["Pune"]}, ev(format="online"), NOW)  # online reaches everyone
    assert not matches({**PREFS, "formats": ["online"]}, ev(format="unknown"), NOW)
    assert not matches({**PREFS, "max_fee": 0}, ev(fee_status="unknown"), NOW)  # unknown is never free
    assert matches({**PREFS, "max_fee": 500}, ev(fee_status="paid", fee_amount=499), NOW)
    assert not matches({**PREFS, "max_fee": 100}, ev(fee_status="paid", fee_amount=499), NOW)
    assert not matches({**PREFS, "prize_only": True}, ev(), NOW)
    assert not matches(PREFS, ev(registration_status="closed"), NOW)
    assert not matches(PREFS, ev(registration_deadline="2026-10-01T00:00:00+00:00"), NOW)


def test_build_alerts_types_and_interest():
    opened, closed = ev(id=2), ev(id=3, registration_status="closed")
    alerts = build_alerts([PREFS], [ev()], [opened, closed], [ev(id=4)], {3: {"u1"}, 4: {"u1"}}, NOW)
    kinds = {(a["event_id"], a["alert_type"]) for a in alerts}
    assert kinds == {(1, "new_event"), (2, "registration_opened"), (3, "availability_changed"), (4, "deadline_reminder")}
    assert build_alerts([{**PREFS, "alert_new_event": False}], [ev()], [], [], {}, NOW) == []
    assert build_alerts([PREFS], [], [], [ev(id=4)], {}, NOW) == []  # reminders only for interested users


def test_auto_registration_and_paid_alerts():
    free_ev = ev(id=10, fee_status="free", fee_amount=0)
    paid_ev = ev(id=11, fee_status="paid", fee_amount=250)

    # When auto_register is True: free events yield auto_registered alert
    auto_prefs = {**PREFS, "auto_register": True, "notify_paid": True}
    alerts = build_alerts([auto_prefs], [free_ev, paid_ev], [], [], {}, NOW)
    kinds = {(a["event_id"], a["alert_type"]) for a in alerts}
    assert kinds == {(10, "auto_registered"), (11, "paid_event_review")}

    # When notify_paid is False: paid events are not alerted
    no_paid_prefs = {**PREFS, "auto_register": True, "notify_paid": False}
    alerts_no_paid = build_alerts([no_paid_prefs], [free_ev, paid_ev], [], [], {}, NOW)
    kinds_no_paid = {(a["event_id"], a["alert_type"]) for a in alerts_no_paid}
    assert kinds_no_paid == {(10, "auto_registered")}


def test_downgrade_keeps_alerts_the_old_constraint_accepts():
    batch = [{"user_id": "u1", "event_id": 1, "alert_type": "paid_event_review", "message": "m"},
             {"user_id": "u1", "event_id": 2, "alert_type": "deadline_reminder", "message": "m"}]
    assert [a["alert_type"] for a in downgrade(batch)] == ["new_event", "deadline_reminder"]
    assert batch[0]["alert_type"] == "paid_event_review"  # input untouched
