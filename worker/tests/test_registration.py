from pathlib import Path

import pytest

from registration import LocalHtmlAdapter, fill_for_submit, map_fields, pick_option, prepare_page, unresolved_labels

PROFILE = {"full_name": "Asha Rao", "email": "asha@example.com", "phone": "+91 90000 00000", "organization": "MLRIT",
           "gender": "female", "tshirt_size": "M", "date_of_birth": "2004-05-01"}
ANSWERS = [{"question": "Why do you want to attend?", "answer": "To build and learn."}]
FORM = (Path(__file__).parent / "fixtures" / "test_form.html").resolve().as_uri()


def f(label, kind="text", required=True, options=None):
    return {"label": label, "kind": kind, "required": required, "options": options or [], "handle": label}


def test_mapping_is_explicit_and_never_guesses():
    items = map_fields([f("Full name"), f("College email", "email"), f("Name of college"), f("Team name"),
                        f("Date of birth"), f("Gender", "radio", options=["Female", "Male"]),
                        f("I agree to the terms", "checkbox", options=["I agree to the terms"]),
                        f("UPI transaction id"), f("Why do you want to attend?", "textarea")], PROFILE, ANSWERS)
    got = {i["label"]: (i["value"], i["source"]) for i in items}
    assert got["Full name"] == ("Asha Rao", "profile.full_name")
    assert got["College email"] == ("asha@example.com", "profile.email")
    assert got["Name of college"] == ("MLRIT", "profile.organization")
    assert got["Team name"] == ("", "needs_user")
    assert got["Date of birth"] == ("", "needs_user")  # text date: format unknown, so ask
    assert got["Gender"] == ("Female", "profile.gender")
    assert got["I agree to the terms"] == ("", "consent")  # never auto-accepted
    assert got["UPI transaction id"] == ("", "manual")
    assert got["Why do you want to attend?"] == ("To build and learn.", "saved answer")


def test_unresolved_blocks_until_user_resolves():
    items = map_fields([f("Team name"), f("I agree to the terms", "checkbox", options=["I agree"]),
                        f("Size", "select", options=["S", "M"]), f("Resume", "file", required=False)], PROFILE, [])
    assert len(unresolved_labels(items)) == 3  # team name, consent, size; the optional file does not block
    for i in items:
        i["value"] = {"Team name": "Byte Club", "I agree to the terms": "yes", "Size": "XL"}.get(i["label"], i["value"])
    assert unresolved_labels(items) == ["Size (value must be one of: S, M)"]
    assert pick_option("non_binary", ["Female", "Non-binary"]) == "Non-binary"


@pytest.fixture
def page():
    sync_api = pytest.importorskip("playwright.sync_api")
    with sync_api.sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception as err:
            pytest.skip(f"Chromium not installed: {err}")
        yield browser.new_page()
        browser.close()


@pytest.mark.browser
def test_end_to_end_on_a_form_we_control(page):
    adapter = LocalHtmlAdapter()
    page.goto(FORM)
    items, unresolved = prepare_page(page, adapter, PROFILE, ANSWERS)
    assert unresolved == ["Team name", "I agree to the code of conduct (tick to agree on the website)"]
    assert page.input_value("#full_name") == "Asha Rao" and page.is_checked("input[value=f]")
    assert not page.is_checked("input[name=coc]")  # consent untouched by prepare

    # the user answers and agrees on the website, then approves
    for i in items:
        i["value"] = {"Team name": "Byte Club", "I agree to the code of conduct": "yes"}.get(i["label"], i["value"])
    assert unresolved_labels(items) == []
    page.goto(FORM)
    fill_for_submit(page, adapter, items)
    adapter.submit(page)
    evidence = adapter.success(page)
    assert evidence and evidence.startswith("Registration confirmed. Reference: EP-")


@pytest.mark.browser
def test_changed_form_withdraws_approval(page):
    from registration import FormChanged
    adapter = LocalHtmlAdapter()
    page.goto(FORM)
    items, _ = prepare_page(page, adapter, PROFILE, ANSWERS)
    page.goto(FORM)
    page.evaluate("document.querySelector('#team').closest('p').remove()")
    with pytest.raises(FormChanged):
        fill_for_submit(page, adapter, items)
